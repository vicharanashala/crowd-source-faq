import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

// ---------- PUBLIC READS ----------

export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb
    .from("categories")
    .select("id,name,slug,description,icon,sort_order")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listFaqs = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) =>
    z
      .object({
        categorySlug: z.string().optional(),
        sort: z.enum(["priority", "recent", "top"]).default("priority"),
        limit: z.number().min(1).max(200).default(200),
      })
      .parse(v ?? {}),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    let q = sb
      .from("faqs")
      .select(
        "id,question,answer,category_id,tags,view_count,upvotes,downvotes,priority_score,updated_at,categories(name,slug)",
      )
      .eq("is_published", true)
      .limit(data.limit);

    if (data.categorySlug) {
      const { data: cat } = await sb
        .from("categories")
        .select("id")
        .eq("slug", data.categorySlug)
        .maybeSingle();
      if (cat?.id) q = q.eq("category_id", cat.id);
    }

    if (data.sort === "priority") q = q.order("priority_score", { ascending: false });
    else if (data.sort === "recent") q = q.order("updated_at", { ascending: false });
    else q = q.order("upvotes", { ascending: false });

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getFaq = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: row, error } = await sb
      .from("faqs")
      .select(
        "id,question,answer,category_id,tags,view_count,upvotes,downvotes,priority_score,updated_at,categories(name,slug)",
      )
      .eq("id", data.id)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const getTrending = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb
    .from("faqs")
    .select("id,question,view_count,upvotes,priority_score,categories(name,slug)")
    .eq("is_published", true)
    .order("priority_score", { ascending: false })
    .limit(8);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listRecentQueries = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_queries")
    .select("id,question,status,category_hint,created_at,admin_answer")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
});

// ---------- SEMANTIC SEARCH ----------

export const semanticSearch = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z.object({ query: z.string().min(1).max(500), k: z.number().min(1).max(10).default(6) }).parse(v),
  )
  .handler(async ({ data }) => {
    const { embed } = await import("@/lib/ai.server");
    const vec = await embed(data.query);
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("match_faqs", {
      query_embedding: vec as unknown as string,
      match_count: data.k,
      min_similarity: 0.15,
    });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("search_logs").insert({ query: data.query, matched_faq_id: rows?.[0]?.id ?? null });
    if (rows?.[0]?.id) {
      await supabaseAdmin.rpc("increment_faq_search", { _faq_id: rows[0].id });
    }
    return rows ?? [];
  });

// ---------- AI GROUNDED ANSWER ----------

export const askAi = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ question: z.string().min(3).max(500) }).parse(v))
  .handler(async ({ data }) => {
    const { embed, chat } = await import("@/lib/ai.server");
    const vec = await embed(data.question);
    const sb = publicClient();
    const { data: matches, error } = await sb.rpc("match_faqs", {
      query_embedding: vec as unknown as string,
      match_count: 5,
      min_similarity: 0.1,
    });
    if (error) throw new Error(error.message);

    const sources = matches ?? [];
    if (sources.length === 0) {
      return {
        answer:
          "I couldn't find that in our FAQ knowledge base. You can raise a query and an admin will answer it.",
        sources: [],
      };
    }

    const context = sources
      .map(
        (s: { question: string; answer: string }, i: number) =>
          `[${i + 1}] Q: ${s.question}\nA: ${s.answer}`,
      )
      .join("\n\n");

    const answer = await chat([
      {
        role: "system",
        content:
          "You are a warm, precise assistant for the Vicharanashala Internship (VINS) at IIT Ropar. Answer ONLY from the provided FAQ context. Cite sources with bracket numbers like [1], [2]. If the context does not contain the answer, say so and suggest raising a query. Keep answers under 180 words, plain and friendly.",
      },
      { role: "user", content: `Question: ${data.question}\n\nFAQ Context:\n${context}` },
    ]);

    return { answer, sources };
  });

// ---------- USER ACTIONS (auth) ----------

export const voteFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ faqId: z.string().uuid(), value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.value === 0) {
      await supabase.from("faq_votes").delete().eq("faq_id", data.faqId).eq("user_id", userId);
    } else {
      await supabase.from("faq_votes").upsert(
        { faq_id: data.faqId, user_id: userId, value: data.value },
        { onConflict: "faq_id,user_id" },
      );
    }
    return { ok: true };
  });

export const getMyVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ faqId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("faq_votes")
      .select("value")
      .eq("faq_id", data.faqId)
      .eq("user_id", userId)
      .maybeSingle();
    return row?.value ?? 0;
  });

export const trackView = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ faqId: z.string().uuid() }).parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("increment_faq_view", { _faq_id: data.faqId });
    return { ok: true };
  });

export const submitQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        question: z.string().min(10).max(1000),
        context: z.string().max(2000).optional(),
        category_hint: z.string().max(80).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("user_queries")
      .insert({
        user_id: userId,
        question: data.question,
        context: data.context ?? null,
        category_hint: data.category_hint ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const myQueries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_queries")
      .select("id,question,status,admin_answer,created_at,updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const myStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [votes, queries, searches, profile] = await Promise.all([
      supabase.from("faq_votes").select("value").eq("user_id", userId),
      supabase.from("user_queries").select("status").eq("user_id", userId),
      supabase.from("search_logs").select("id", { head: true, count: "exact" }).eq("user_id", userId),
      supabase.from("profiles").select("full_name,avatar_url,bio").eq("id", userId).maybeSingle(),
    ]);
    const likeCount = votes.data?.filter((v) => v.value === 1).length ?? 0;
    const dislikeCount = votes.data?.filter((v) => v.value === -1).length ?? 0;
    return {
      voteCount: votes.data?.length ?? 0,
      likeCount,
      dislikeCount,
      queryCount: queries.data?.length ?? 0,
      answeredCount: queries.data?.filter((q) => q.status === "answered").length ?? 0,
      searchCount: searches.count ?? 0,
      profile: profile.data,
    };
  });

export const myLikedFaqs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: votes } = await supabase
      .from("faq_votes")
      .select("faq_id,created_at")
      .eq("user_id", userId)
      .eq("value", 1)
      .order("created_at", { ascending: false })
      .limit(20);
    const ids = (votes ?? []).map((v) => v.faq_id);
    if (ids.length === 0) return [] as Array<{ id: string; question: string; category: string | null; likedAt: string }>;
    const { data: faqs } = await supabase
      .from("faqs")
      .select("id,question,categories(name)")
      .in("id", ids);
    const map = new Map((faqs ?? []).map((f) => [f.id, f]));
    return (votes ?? [])
      .map((v) => {
        const f = map.get(v.faq_id);
        if (!f) return null;
        const cat = (f.categories as { name?: string } | null)?.name ?? null;
        return { id: f.id, question: f.question, category: cat, likedAt: v.created_at };
      })
      .filter((x): x is { id: string; question: string; category: string | null; likedAt: string } => !!x);
  });

export const myRecentSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("search_logs")
      .select("id,query,created_at,matched_faq_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);
    return data ?? [];
  });

export const myProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as { supabase: ReturnType<typeof publicClient>; userId: string; claims: { email?: string; created_at?: string } };
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name,avatar_url,bio,created_at,updated_at")
      .eq("id", userId)
      .maybeSingle();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    return {
      id: userId,
      email: claims?.email ?? null,
      full_name: profile?.full_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      bio: profile?.bio ?? null,
      created_at: profile?.created_at ?? null,
      updated_at: profile?.updated_at ?? null,
      roles: (roles ?? []).map((r) => r.role as string),
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    full_name: z.string().trim().max(120).nullable().optional(),
    bio: z.string().max(2000).nullable().optional(),
    avatar_url: z.string().url().max(500).nullable().optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: { full_name?: string | null; bio?: string | null; avatar_url?: string | null; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.bio !== undefined) patch.bio = data.bio;
    if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ADMIN ----------

async function assertAdmin(context: { supabase: ReturnType<typeof publicClient>; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

async function logAdminAction(
  actorId: string,
  action: string,
  target: { type?: string; id?: string; details?: Record<string, unknown> } = {},
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as unknown as {
      from: (t: string) => { insert: (row: unknown) => Promise<unknown> };
    })
      .from("admin_activity_logs")
      .insert({
        actor_id: actorId,
        action,
        target_type: target.type ?? null,
        target_id: target.id ?? null,
        details: target.details ?? {},
      });
  } catch (e) {
    console.error("[logAdminAction] failed", e);
  }
}

export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return !!data;
  });

export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("*", { head: true, count: "exact" })
      .eq("role", "admin");
    if ((count ?? 0) > 0) return { ok: false, reason: "admin_exists" };
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    return { ok: true };
  });

export const adminListQueries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("user_queries")
      .select("id,question,context,status,admin_answer,category_hint,created_at,user_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminAnswerQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ id: z.string().uuid(), answer: z.string().min(3).max(4000) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("user_queries")
      .update({ admin_answer: data.answer, status: "answered" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, "query.answer", {
      type: "user_query",
      id: data.id,
      details: { answer_preview: data.answer.slice(0, 140) },
    });
    return { ok: true };
  });

export const adminUpsertFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        category_id: z.string().uuid().nullable(),
        question: z.string().min(3).max(500),
        answer: z.string().min(3).max(8000),
        tags: z.array(z.string()).default([]),
        is_published: z.boolean().default(true),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { embed } = await import("@/lib/ai.server");
    const vec = await embed(`${data.question}\n\n${data.answer}`);
    const payload = {
      category_id: data.category_id,
      question: data.question,
      answer: data.answer,
      tags: data.tags,
      is_published: data.is_published,
      embedding: vec as unknown as string,
    };
    if (data.id) {
      const { error } = await context.supabase.from("faqs").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await logAdminAction(context.userId, "faq.update", {
        type: "faq",
        id: data.id,
        details: { question: data.question, is_published: data.is_published },
      });
      return { id: data.id };
    } else {
      const { data: row, error } = await context.supabase.from("faqs").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      await logAdminAction(context.userId, "faq.create", {
        type: "faq",
        id: row.id,
        details: { question: data.question, is_published: data.is_published },
      });
      return { id: row.id };
    }
  });

export const adminDeleteFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("faqs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, "faq.delete", { type: "faq", id: data.id });
    return { ok: true };
  });

export const adminListFaqs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("faqs")
      .select(
        "id,question,answer,category_id,tags,is_published,view_count,upvotes,downvotes,updated_at,categories(name,slug)",
      )
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminSetFaqPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ id: z.string().uuid(), is_published: z.boolean() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("faqs")
      .update({ is_published: data.is_published })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdminAction(
      context.userId,
      data.is_published ? "faq.publish" : "faq.unpublish",
      { type: "faq", id: data.id },
    );
    return { ok: true };
  });

export const adminBulkDeleteFaqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("faqs").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, "faq.bulk_delete", {
      type: "faq",
      details: { count: data.ids.length, ids: data.ids },
    });
    return { ok: true, count: data.ids.length };
  });

export const adminDeleteQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("user_queries")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, "query.delete", {
      type: "user_query",
      id: data.id,
    });
    return { ok: true };
  });

export const adminBulkDeleteQueries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("user_queries")
      .delete()
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, "query.bulk_delete", {
      type: "user_query",
      details: { count: data.ids.length, ids: data.ids },
    });
    return { ok: true, count: data.ids.length };
  });

export const adminRecentComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("faq_comments")
      .select("id,body,user_id,faq_id,created_at,faqs(question)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,full_name").in("id", ids)
      : { data: [] as Array<{ id: string; full_name: string | null }> };
    const pmap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
    return (rows ?? []).map((r) => ({
      id: r.id,
      body: r.body,
      created_at: r.created_at,
      faq_id: r.faq_id,
      faq_question: (r as { faqs?: { question?: string } | null }).faqs?.question ?? null,
      author_name: pmap.get(r.user_id) ?? "Unknown",
    }));
  });

export const adminDeleteFaqComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("faq_comments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, "comment.delete", {
      type: "faq_comment",
      id: data.id,
    });
    return { ok: true };
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "moderator"]),
        grant: z.boolean(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: data.userId, role: data.role },
          { onConflict: "user_id,role" },
        );
      if (error) throw new Error(error.message);
    } else {
      // prevent removing last admin
      if (data.role === "admin") {
        const { count } = await supabaseAdmin
          .from("user_roles")
          .select("*", { head: true, count: "exact" })
          .eq("role", "admin");
        if ((count ?? 0) <= 1) throw new Error("Cannot remove the last admin");
      }
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await logAdminAction(
      context.userId,
      data.grant ? "role.grant" : "role.revoke",
      { type: "user", id: data.userId, details: { role: data.role } },
    );
    return { ok: true };
  });

export const adminActivityLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ limit: z.number().min(1).max(500).default(100) }).parse(v ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data:
              | Array<{
                id: string;
                actor_id: string | null;
                action: string;
                target_type: string | null;
                target_id: string | null;
                details: unknown;
                created_at: string;
              }>
              | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
      auth: { admin: { listUsers: (o: { page: number; perPage: number }) => Promise<{ data: { users: Array<{ id: string; email?: string | null }> } }> } };
    };
    const { data: rows, error } = await sb
      .from("admin_activity_logs")
      .select("id,actor_id,action,target_type,target_id,details,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    const actorIds = Array.from(new Set(list.map((r) => r.actor_id).filter(Boolean))) as string[];
    const emails: Record<string, string> = {};
    if (actorIds.length) {
      const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const u of users.users) {
        if (actorIds.includes(u.id)) emails[u.id] = u.email ?? "";
      }
    }
    return list.map((r) => ({
      id: r.id,
      actor_id: r.actor_id,
      actor_email: r.actor_id ? emails[r.actor_id] ?? null : null,
      action: r.action,
      target_type: r.target_type,
      target_id: r.target_id,
      details: (r.details ?? null) as Record<string, string | number | boolean | null> | null,
      created_at: r.created_at,
    }));
  });


// ---------- ADMIN ANALYTICS / USERS / ACTIVITY ----------

export const adminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const iso = startOfDay.toISOString();

    const [users, profiles, faqAgg, votesAgg, queries, searches, todaySearches, activeStudents] =
      await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }),
        supabaseAdmin.from("profiles").select("id", { head: true, count: "exact" }),
        supabaseAdmin.from("faqs").select("view_count,upvotes,downvotes"),
        supabaseAdmin.from("faq_votes").select("value"),
        supabaseAdmin.from("user_queries").select("status"),
        supabaseAdmin.from("search_logs").select("id", { head: true, count: "exact" }),
        supabaseAdmin
          .from("search_logs")
          .select("id", { head: true, count: "exact" })
          .gte("created_at", iso),
        supabaseAdmin
          .from("search_logs")
          .select("user_id")
          .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()),
      ]);

    const totalViews = (faqAgg.data ?? []).reduce((a, f) => a + (f.view_count ?? 0), 0);
    const totalUpvotes = (votesAgg.data ?? []).filter((v) => v.value === 1).length;
    const totalDownvotes = (votesAgg.data ?? []).filter((v) => v.value === -1).length;
    const active = new Set((activeStudents.data ?? []).map((r) => r.user_id).filter(Boolean)).size;

    return {
      totalUsers:
        (users.data as { total?: number } | null)?.total ?? profiles.count ?? 0,
      totalFAQs: (faqAgg.data ?? []).length,
      totalViews,
      totalLikes: totalUpvotes,
      totalDislikes: totalDownvotes,
      totalSearches: searches.count ?? 0,
      todaySearches: todaySearches.count ?? 0,
      activeStudents: active,
      totalQueries: (queries.data ?? []).length,
      pendingQueries: (queries.data ?? []).filter((q) => q.status !== "answered").length,
      answeredQueries: (queries.data ?? []).filter((q) => q.status === "answered").length,
    };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authData, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Error(error.message);
    const users = authData?.users ?? [];
    const ids = users.map((u) => u.id);
    const [{ data: profiles }, { data: roles }, { data: queries }, { data: votes }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id,full_name,avatar_url").in("id", ids),
        supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", ids),
        supabaseAdmin.from("user_queries").select("user_id").in("user_id", ids),
        supabaseAdmin.from("faq_votes").select("user_id").in("user_id", ids),
      ]);
    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    const qCount: Record<string, number> = {};
    (queries ?? []).forEach((q) => {
      if (q.user_id) qCount[q.user_id] = (qCount[q.user_id] ?? 0) + 1;
    });
    const vCount: Record<string, number> = {};
    (votes ?? []).forEach((v) => {
      if (v.user_id) vCount[v.user_id] = (vCount[v.user_id] ?? 0) + 1;
    });

    return users.map((u) => {
      const p = profMap.get(u.id);
      const bannedUntil = (u as { banned_until?: string | null }).banned_until ?? null;
      const disabled = bannedUntil ? new Date(bannedUntil) > new Date() : false;
      return {
        id: u.id,
        email: u.email ?? "",
        name: p?.full_name ?? u.email?.split("@")[0] ?? "—",
        avatar_url: p?.avatar_url ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        roles: roleMap.get(u.id) ?? [],
        queries: qCount[u.id] ?? 0,
        votes: vCount[u.id] ?? 0,
        disabled,
      };
    });
  });

export const adminToggleUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ userId: z.string().uuid(), disable: z.boolean() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.userId === context.userId) throw new Error("You cannot disable your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.disable ? "876000h" : "none",
    } as { ban_duration: string });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRecentActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [searches, queries, faqs] = await Promise.all([
      supabaseAdmin
        .from("search_logs")
        .select("id,query,created_at,matched_faq_id")
        .order("created_at", { ascending: false })
        .limit(15),
      supabaseAdmin
        .from("user_queries")
        .select("id,question,status,created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      supabaseAdmin
        .from("faqs")
        .select("id,question,updated_at")
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);
    return {
      searches: searches.data ?? [],
      queries: queries.data ?? [],
      faqs: faqs.data ?? [],
    };
  });

export const adminTopSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("search_logs")
      .select("query")
      .order("created_at", { ascending: false })
      .limit(500);
    const counts: Record<string, number> = {};
    (data ?? []).forEach((r) => {
      const k = (r.query ?? "").toLowerCase().trim();
      if (!k) return;
      counts[k] = (counts[k] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));
  });

export const adminFailedSearchTerms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("search_logs")
      .select("query")
      .is("matched_faq_id", null)
      .order("created_at", { ascending: false })
      .limit(500);
    const stop = new Set([
      "the", "a", "an", "of", "to", "in", "for", "and", "or", "is", "are", "was", "were", "be",
      "how", "what", "when", "where", "why", "who", "do", "does", "did", "can", "i", "my", "me",
      "it", "this", "that", "on", "at", "by", "with", "as", "if", "from", "get", "have", "has",
    ]);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) {
      const words = (r.query ?? "").toLowerCase().match(/[a-z][a-z0-9']{2,}/g) ?? [];
      for (const w of words) {
        if (stop.has(w)) continue;
        counts[w] = (counts[w] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([term, count]) => ({ term, count }));
  });

function bucketByDay<T extends { created_at: string }>(rows: T[], days: number) {
  const buckets: { date: string; count: number }[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 864e5);
    buckets.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.date, i]));
  for (const r of rows) {
    const key = new Date(r.created_at).toISOString().slice(0, 10);
    const i = idx.get(key);
    if (i !== undefined) buckets[i].count += 1;
  }
  return buckets;
}

export const adminFaqGrowth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const { data } = await supabaseAdmin
      .from("faqs")
      .select("created_at")
      .gte("created_at", since);
    return bucketByDay(data ?? [], 14);
  });

export const adminUserActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const { data } = await supabaseAdmin
      .from("search_logs")
      .select("created_at,user_id")
      .gte("created_at", since);
    const days: Record<string, { searches: number; users: Set<string> }> = {};
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 864e5).toISOString().slice(0, 10);
      days[d] = { searches: 0, users: new Set() };
    }
    for (const r of data ?? []) {
      const k = new Date(r.created_at).toISOString().slice(0, 10);
      if (!days[k]) continue;
      days[k].searches += 1;
      if (r.user_id) days[k].users.add(r.user_id);
    }
    return Object.entries(days).map(([date, v]) => ({
      date,
      searches: v.searches,
      users: v.users.size,
    }));
  });

export const adminSearchInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [total, failed] = await Promise.all([
      supabaseAdmin.from("search_logs").select("id", { head: true, count: "exact" }),
      supabaseAdmin
        .from("search_logs")
        .select("id", { head: true, count: "exact" })
        .is("matched_faq_id", null),
    ]);
    const t = total.count ?? 0;
    const f = failed.count ?? 0;
    return {
      totalSearches: t,
      failedSearches: f,
      failRate: t ? Math.round((f / t) * 1000) / 10 : 0,
    };
  });

export const adminTopCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("faqs")
      .select("category_id, view_count, categories(name)");
    const map = new Map<string, { name: string; faqs: number; views: number }>();
    for (const f of data ?? []) {
      const name = (f as { categories?: { name?: string } | null }).categories?.name ?? "Uncategorized";
      const key = f.category_id ?? "none";
      const cur = map.get(key) ?? { name, faqs: 0, views: 0 };
      cur.faqs += 1;
      cur.views += f.view_count ?? 0;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.faqs - a.faqs)
      .slice(0, 6);
  });

// ---------- BOOKMARKS ----------

export const toggleBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ faqId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", userId)
      .eq("faq_id", data.faqId)
      .maybeSingle();
    if (existing) {
      await supabase.from("bookmarks").delete().eq("id", existing.id);
      return { bookmarked: false };
    }
    await supabase.from("bookmarks").insert({ user_id: userId, faq_id: data.faqId });
    return { bookmarked: true };
  });

export const isBookmarked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ faqId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", userId)
      .eq("faq_id", data.faqId)
      .maybeSingle();
    return !!row;
  });

export const myBookmarks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: bms } = await supabase
      .from("bookmarks")
      .select("faq_id,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    const ids = (bms ?? []).map((b) => b.faq_id);
    if (!ids.length) return [] as Array<{ id: string; question: string; category: string | null; created_at: string }>;
    const { data: faqs } = await supabase
      .from("faqs")
      .select("id,question,categories(name)")
      .in("id", ids);
    const map = new Map((faqs ?? []).map((f) => [f.id, f]));
    return (bms ?? [])
      .map((b) => {
        const f = map.get(b.faq_id);
        if (!f) return null;
        const cat = (f.categories as { name?: string } | null)?.name ?? null;
        return { id: f.id, question: f.question, category: cat, created_at: b.created_at };
      })
      .filter((x): x is { id: string; question: string; category: string | null; created_at: string } => !!x);
  });

// ---------- COMMENTS ----------

export const listFaqComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ faqId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("faq_comments")
      .select("id,body,user_id,created_at,updated_at")
      .eq("faq_id", data.faqId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,full_name,avatar_url").in("id", ids)
      : { data: [] as Array<{ id: string; full_name: string | null; avatar_url: string | null }> };
    const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({
      ...r,
      author: pmap.get(r.user_id) ?? { id: r.user_id, full_name: null, avatar_url: null },
    }));
  });

export const addFaqComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ faqId: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("faq_comments")
      .insert({ faq_id: data.faqId, user_id: userId, body: data.body.trim() })
      .select("id,body,user_id,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteFaqComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("faq_comments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- NOTIFICATIONS ----------

export const myNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("notifications")
      .select("id,type,title,body,link,is_read,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("notifications").update({ is_read: true }).eq("user_id", userId);
    if (data.id) q = q.eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("notifications").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- SITE ALERTS -------------------- */

export type SiteAlert = {
  id: string;
  message: string;
  tone: "info" | "success" | "warning" | "danger";
  active: boolean;
  link_url: string | null;
  link_label: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
};

export const activeSiteAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          or: (s: string) => {
            order: (col: string, opts: { ascending: boolean }) => Promise<{
              data: SiteAlert[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const { data, error } = await sb
    .from("site_alerts")
    .select("id,message,tone,active,link_url,link_label,created_by,created_at,expires_at")
    .eq("active", true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SiteAlert[];
});

export const listSiteAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{
            data: SiteAlert[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    const { data, error } = await sb
      .from("site_alerts")
      .select("id,message,tone,active,link_url,link_label,created_by,created_at,expires_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as SiteAlert[];
  });

export const upsertSiteAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        message: z.string().min(1).max(500),
        tone: z.enum(["info", "success", "warning", "danger"]).default("info"),
        active: z.boolean().default(true),
        link_url: z.string().url().nullable().optional(),
        link_label: z.string().max(60).nullable().optional(),
        expires_at: z.string().nullable().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as unknown as {
      from: (t: string) => {
        upsert: (row: unknown) => {
          select: (c: string) => {
            single: () => Promise<{ data: SiteAlert | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const row = {
      ...(data.id ? { id: data.id } : {}),
      message: data.message,
      tone: data.tone,
      active: data.active,
      link_url: data.link_url ?? null,
      link_label: data.link_label ?? null,
      expires_at: data.expires_at ?? null,
      created_by: context.userId,
    };
    const { data: saved, error } = await sb.from("site_alerts").upsert(row).select("*").single();
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, data.id ? "alert.update" : "alert.create", {
      type: "site_alert",
      id: saved?.id,
      details: { tone: data.tone, active: data.active },
    });
    return saved;
  });

export const deleteSiteAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as unknown as {
      from: (t: string) => {
        delete: () => { eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }> };
      };
    };
    const { error } = await sb.from("site_alerts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, "alert.delete", { type: "site_alert", id: data.id });
    return { ok: true };
  });



// ---------- SELF-HEALING (FAQ suggestions from failed searches) ----------

export const adminUnansweredClusters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data } = await supabaseAdmin
      .from("search_logs")
      .select("query,created_at")
      .is("matched_faq_id", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);

    const norm = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

    const groups = new Map<string, { query: string; count: number; last: string; samples: Set<string> }>();
    for (const r of data ?? []) {
      const q = (r.query ?? "").toString();
      const key = norm(q);
      if (!key || key.length < 3) continue;
      const g = groups.get(key);
      if (g) {
        g.count += 1;
        g.samples.add(q);
        if (r.created_at > g.last) g.last = r.created_at;
      } else {
        groups.set(key, { query: q, count: 1, last: r.created_at, samples: new Set([q]) });
      }
    }

    return Array.from(groups.entries())
      .map(([key, g]) => ({
        key,
        query: g.query,
        count: g.count,
        last: g.last,
        samples: Array.from(g.samples).slice(0, 5),
      }))
      .sort((a, b) => b.count - a.count || (b.last > a.last ? 1 : -1))
      .slice(0, 40);
  });

export const adminSuggestFaqDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ query: z.string().min(3).max(500) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { chat, embed } = await import("@/lib/ai.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pull closest existing FAQs for grounding
    let related: Array<{ question: string; answer: string }> = [];
    try {
      const vec = await embed(data.query);
      const { data: matches } = await supabaseAdmin.rpc("match_faqs", {
        query_embedding: vec as unknown as string,
        match_count: 4,
        min_similarity: 0.15,
      });
      related = (matches ?? []).map((m: { question: string; answer: string }) => ({
        question: m.question,
        answer: m.answer,
      }));
    } catch {
      // grounding is best-effort
    }

    const grounding = related
      .map((r, i) => `[${i + 1}] Q: ${r.question}\nA: ${r.answer}`)
      .join("\n\n");

    const sys =
      "You draft concise knowledge-base FAQs for a university help centre. " +
      "Reply ONLY with strict JSON of shape {\"question\":string,\"answer\":string,\"tags\":string[]}. " +
      "Answer must be 2-4 short paragraphs, actionable, neutral tone. " +
      "Tags are 2-5 lowercase single-word topics. Never invent policies not implied by the grounding — if unsure, keep the answer general and advise contacting the office.";

    const user =
      `Student search query (repeatedly asked, no FAQ matches):\n"""${data.query}"""\n\n` +
      (grounding
        ? `Related existing FAQs for context:\n${grounding}\n\n`
        : "No related FAQs found.\n\n") +
      "Draft a new FAQ entry answering this query.";

    const raw = await chat([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);

    const cleaned = raw.replace(/```json|```/g, "").trim();
    let parsed: { question?: string; answer?: string; tags?: string[] } = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
      }
    }

    return {
      question: (parsed.question ?? data.query).toString().slice(0, 500),
      answer: (parsed.answer ?? "").toString().slice(0, 8000),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8).map(String) : [],
      related,
    };
  });

// ---------- ADVANCED VISUALIZATIONS ----------

// Engagement heatmap: 7 days-of-week x 24 hours grid of search counts (last 30 days)
export const adminEngagementHeatmap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data } = await supabaseAdmin
      .from("search_logs")
      .select("created_at")
      .gte("created_at", since)
      .limit(20000);
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of data ?? []) {
      const d = new Date(r.created_at as string);
      grid[d.getDay()][d.getHours()] += 1;
    }
    let max = 0;
    for (const row of grid) for (const v of row) if (v > max) max = v;
    return { grid, max };
  });

// Top contributors: users ranked by combined FAQ votes + comments + community posts (last 30 days)
export const adminTopContributors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 30 * 864e5).toISOString();

    const [votes, comments, posts] = await Promise.all([
      supabaseAdmin.from("faq_votes").select("user_id").gte("created_at", since).limit(5000),
      supabaseAdmin.from("faq_comments").select("user_id").gte("created_at", since).limit(5000),
      supabaseAdmin.from("community_posts").select("user_id").gte("created_at", since).limit(5000),
    ]);

    const tally = new Map<string, { votes: number; comments: number; posts: number }>();
    const bump = (id: string | null | undefined, key: "votes" | "comments" | "posts") => {
      if (!id) return;
      const t = tally.get(id) ?? { votes: 0, comments: 0, posts: 0 };
      t[key] += 1;
      tally.set(id, t);
    };
    (votes.data ?? []).forEach((r) => bump(r.user_id, "votes"));
    (comments.data ?? []).forEach((r) => bump(r.user_id, "comments"));
    (posts.data ?? []).forEach((r) => bump(r.user_id, "posts"));

    const ids = Array.from(tally.keys());
    if (!ids.length) return [] as Array<{ userId: string; name: string; avatar: string | null; votes: number; comments: number; posts: number; total: number }>;

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,avatar_url")
      .in("id", ids);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return ids
      .map((id) => {
        const t = tally.get(id)!;
        const p = pmap.get(id);
        return {
          userId: id,
          name: p?.full_name ?? "Anonymous",
          avatar: p?.avatar_url ?? null,
          votes: t.votes,
          comments: t.comments,
          posts: t.posts,
          total: t.votes + t.comments * 2 + t.posts * 3,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  });


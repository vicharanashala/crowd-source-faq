import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listCommunityPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("community_posts")
      .select("id, user_id, title, body, kind, tags, upvotes, comment_count, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100);
    const rows = data ?? [];
    if (!rows.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name, avatar_url").in("id", ids);
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return rows.map((r) => ({ ...r, profiles: map.get(r.user_id) ?? null }));
  });


export const getCommunityPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: post } = await context.supabase
      .from("community_posts")
      .select("*, profiles:user_id(full_name, avatar_url)")
      .eq("id", data.id)
      .maybeSingle();
    const { data: comments } = await context.supabase
      .from("community_post_comments")
      .select("id, user_id, body, created_at, profiles:user_id(full_name, avatar_url)")
      .eq("post_id", data.id)
      .order("created_at", { ascending: true });
    return { post, comments: comments ?? [] };
  });

export const createCommunityPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10000),
    kind: z.enum(["discussion", "question", "announcement"]).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("community_posts")
      .insert({
        user_id: context.userId,
        title: data.title.trim(),
        body: data.body.trim(),
        kind: data.kind ?? "discussion",
        tags: data.tags ?? [],
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteCommunityPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("community_posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addCommunityComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    post_id: z.string().uuid(),
    body: z.string().trim().min(1).max(5000),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("community_post_comments")
      .insert({ post_id: data.post_id, user_id: context.userId, body: data.body.trim() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const voteCommunityPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { post_id: string; value: -1 | 0 | 1 }) => d)
  .handler(async ({ data, context }) => {
    if (data.value === 0) {
      await context.supabase
        .from("community_post_votes")
        .delete()
        .eq("post_id", data.post_id)
        .eq("user_id", context.userId);
    } else {
      await context.supabase
        .from("community_post_votes")
        .upsert(
          { post_id: data.post_id, user_id: context.userId, value: data.value },
          { onConflict: "post_id,user_id" },
        );
    }
    return { ok: true };
  });

/* ============ SUPPORT ============ */

export const listSupportCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase
    .from("support_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  return data ?? [];
});

export const mySupportRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("support_requests")
      .select("*, support_categories(name)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const createSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10000),
    category_id: z.string().uuid().nullable().optional(),
    priority: z.enum(["normal", "high"]).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("support_requests")
      .insert({
        user_id: context.userId,
        subject: data.subject.trim(),
        body: data.body.trim(),
        category_id: data.category_id ?? null,
        priority: data.priority ?? "normal",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const closeMySupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("support_requests")
      .update({ status: "closed" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

/* ============ ADMIN ============ */

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const adminListSupportRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("support_requests")
      .select("*, profiles:user_id(full_name, avatar_url), support_categories(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const adminRespondSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    id: z.string().uuid(),
    response: z.string().trim().min(1).max(10000),
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("support_requests")
      .update({
        admin_response: data.response,
        status: data.status ?? "resolved",
        responded_at: new Date().toISOString(),
        assigned_to: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpsertSupportCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; slug: string; description?: string; sort_order?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.id) {
      await context.supabase.from("support_categories").update({
        name: data.name, slug: data.slug, description: data.description ?? null, sort_order: data.sort_order ?? 0,
      }).eq("id", data.id);
    } else {
      await context.supabase.from("support_categories").insert({
        name: data.name, slug: data.slug, description: data.description ?? null, sort_order: data.sort_order ?? 0,
      });
    }
    return { ok: true };
  });

export const adminDeleteSupportCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("support_categories").delete().eq("id", data.id);
    return { ok: true };
  });

export const adminHidePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; hidden: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase
      .from("community_posts")
      .update({ status: data.hidden ? "hidden" : "published" })
      .eq("id", data.id);
    return { ok: true };
  });

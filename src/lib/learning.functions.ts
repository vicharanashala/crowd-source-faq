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

async function assertAdmin(context: { supabase: ReturnType<typeof publicClient>; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

async function logTimeline(
  userId: string,
  kind: string,
  title: string,
  body: string | null = null,
  link: string | null = null,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("timeline_events").insert({
      user_id: userId,
      kind,
      title,
      body,
      link,
    });
  } catch (e) {
    console.error("[logTimeline] failed", e);
  }
}

// ================= COURSES (public listing for signed-in users) =================

export const listPublishedCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("courses")
      .select("id,title,slug,description,cover_url,is_published,created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCourseDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: course, error } = await context.supabase
      .from("courses")
      .select("id,title,slug,description,cover_url,is_published,created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!course) throw new Error("Course not found");
    const { data: modules } = await context.supabase
      .from("course_modules")
      .select("id,title,content,sort_order")
      .eq("course_id", data.id)
      .order("sort_order");
    const { data: enrol } = await context.supabase
      .from("enrollments")
      .select("id,status,progress_pct,enrolled_at,completed_at")
      .eq("course_id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: progress } = await context.supabase
      .from("module_progress")
      .select("module_id")
      .eq("user_id", context.userId);
    const completed = new Set((progress ?? []).map((p) => p.module_id));
    return {
      course,
      modules: modules ?? [],
      enrollment: enrol,
      completedModuleIds: Array.from(completed),
    };
  });

// ================= ENROLLMENTS =================

export const myEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("enrollments")
      .select("id,status,progress_pct,enrolled_at,completed_at,courses(id,title,slug,cover_url,description)")
      .eq("user_id", context.userId)
      .order("enrolled_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const enrollInCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ courseId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: course, error: cErr } = await context.supabase
      .from("courses")
      .select("id,title,is_published")
      .eq("id", data.courseId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!course || !course.is_published) throw new Error("Course not available");

    const { data: existing } = await context.supabase
      .from("enrollments")
      .select("id")
      .eq("user_id", context.userId)
      .eq("course_id", data.courseId)
      .maybeSingle();
    if (existing) return { ok: true, id: existing.id, alreadyEnrolled: true };

    const { data: row, error } = await context.supabase
      .from("enrollments")
      .insert({ user_id: context.userId, course_id: data.courseId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logTimeline(context.userId, "enrolled", `Enrolled in ${course.title}`, null, `/dashboard/courses/${data.courseId}`);
    return { ok: true, id: row.id, alreadyEnrolled: false };
  });

export const unenrollFromCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ courseId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("enrollments")
      .delete()
      .eq("user_id", context.userId)
      .eq("course_id", data.courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================= MODULE PROGRESS =================

async function recomputeProgress(
  supabase: ReturnType<typeof publicClient>,
  userId: string,
  courseId: string,
) {
  const { data: modules } = await supabase
    .from("course_modules")
    .select("id")
    .eq("course_id", courseId);
  const total = modules?.length ?? 0;
  if (total === 0) return 0;
  const ids = modules!.map((m) => m.id);
  const { data: done } = await supabase
    .from("module_progress")
    .select("module_id")
    .eq("user_id", userId)
    .in("module_id", ids);
  const doneCount = done?.length ?? 0;
  const pct = Math.round((doneCount / total) * 100);
  const completed = pct === 100;
  await supabase
    .from("enrollments")
    .update({
      progress_pct: pct,
      status: completed ? "completed" : "active",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("user_id", userId)
    .eq("course_id", courseId);
  return pct;
}

export const toggleModuleComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ moduleId: z.string().uuid(), completed: z.boolean() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: mod, error: mErr } = await context.supabase
      .from("course_modules")
      .select("id,course_id,title,courses(title)")
      .eq("id", data.moduleId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!mod) throw new Error("Module not found");

    if (data.completed) {
      const { error } = await context.supabase
        .from("module_progress")
        .upsert(
          { user_id: context.userId, module_id: data.moduleId },
          { onConflict: "user_id,module_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("module_progress")
        .delete()
        .eq("user_id", context.userId)
        .eq("module_id", data.moduleId);
      if (error) throw new Error(error.message);
    }
    const pct = await recomputeProgress(context.supabase, context.userId, mod.course_id);
    if (data.completed && pct === 100) {
      const courseTitle = (mod as unknown as { courses?: { title: string } | null }).courses?.title ?? "course";
      await logTimeline(
        context.userId,
        "course_completed",
        `Completed ${courseTitle}`,
        null,
        `/dashboard/courses/${mod.course_id}`,
      );
    }
    return { ok: true, progress_pct: pct };
  });

// ================= TIMELINE =================

export const myTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("timeline_events")
      .select("id,kind,title,body,link,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteTimelineEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("timeline_events")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================= ADMIN: COURSES CRUD =================

export const adminListCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("courses")
      .select("id,title,slug,description,cover_url,is_published,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().min(1).max(200),
        slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, "lowercase, digits, hyphens"),
        description: z.string().max(4000).nullable().optional(),
        cover_url: z.string().url().nullable().optional(),
        is_published: z.boolean().default(false),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.id) {
      const { error } = await context.supabase
        .from("courses")
        .update({
          title: data.title,
          slug: data.slug,
          description: data.description ?? null,
          cover_url: data.cover_url ?? null,
          is_published: data.is_published,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("courses")
      .insert({
        title: data.title,
        slug: data.slug,
        description: data.description ?? null,
        cover_url: data.cover_url ?? null,
        is_published: data.is_published,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const adminDeleteCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("courses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================= ADMIN: MODULES =================

export const adminListModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ courseId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: rows, error } = await context.supabase
      .from("course_modules")
      .select("id,course_id,title,content,sort_order,updated_at")
      .eq("course_id", data.courseId)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminUpsertModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        course_id: z.string().uuid(),
        title: z.string().min(1).max(200),
        content: z.string().max(20000).nullable().optional(),
        sort_order: z.number().int().min(0).default(0),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.id) {
      const { error } = await context.supabase
        .from("course_modules")
        .update({
          title: data.title,
          content: data.content ?? null,
          sort_order: data.sort_order,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("course_modules")
      .insert({
        course_id: data.course_id,
        title: data.title,
        content: data.content ?? null,
        sort_order: data.sort_order,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const adminDeleteModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("course_modules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================= ADMIN: CATEGORIES CRUD =================

export const adminListCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("categories")
      .select("id,name,slug,description,icon,sort_order,created_at")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
        description: z.string().max(1000).nullable().optional(),
        icon: z.string().max(60).nullable().optional(),
        sort_order: z.number().int().min(0).default(0),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.id) {
      const { error } = await context.supabase
        .from("categories")
        .update({
          name: data.name,
          slug: data.slug,
          description: data.description ?? null,
          icon: data.icon ?? null,
          sort_order: data.sort_order,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("categories")
      .insert({
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        icon: data.icon ?? null,
        sort_order: data.sort_order,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const adminDeleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================= ADMIN: FEATURE FLAGS =================

export const adminListFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("feature_flags")
      .select("id,key,enabled,description,updated_at")
      .order("key");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        key: z.string().min(1).max(120).regex(/^[a-z0-9_.-]+$/),
        enabled: z.boolean().default(false),
        description: z.string().max(500).nullable().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.id) {
      const { error } = await context.supabase
        .from("feature_flags")
        .update({
          key: data.key,
          enabled: data.enabled,
          description: data.description ?? null,
          updated_by: context.userId,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("feature_flags")
      .insert({
        key: data.key,
        enabled: data.enabled,
        description: data.description ?? null,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const adminDeleteFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("feature_flags").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================= ADMIN: APP SETTINGS =================

export const adminListSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("app_settings")
      .select("id,key,value,description,updated_at")
      .order("key");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        key: z.string().min(1).max(120).regex(/^[a-z0-9_.-]+$/),
        value: z.unknown(),
        description: z.string().max(500).nullable().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const valueJson = (data.value ?? {}) as never;
    if (data.id) {
      const { error } = await context.supabase
        .from("app_settings")
        .update({
          key: data.key,
          value: valueJson,
          description: data.description ?? null,
          updated_by: context.userId,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("app_settings")
      .insert({
        key: data.key,
        value: valueJson,
        description: data.description ?? null,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const adminDeleteSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("app_settings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

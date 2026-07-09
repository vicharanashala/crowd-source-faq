-- File: 20260708045607_66ed70e8-3e02-455f-b9d8-6824999d6fce.sql

-- pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Categories
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  description text,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories readable by all" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- FAQs with embeddings
CREATE TABLE public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  question text NOT NULL,
  answer text NOT NULL,
  tags text[] DEFAULT ARRAY[]::text[],
  view_count int NOT NULL DEFAULT 0,
  upvotes int NOT NULL DEFAULT 0,
  downvotes int NOT NULL DEFAULT 0,
  search_count int NOT NULL DEFAULT 0,
  priority_score real NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.faqs TO anon, authenticated;
GRANT ALL ON public.faqs TO service_role;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published FAQs readable" ON public.faqs FOR SELECT USING (is_published = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage FAQs" ON public.faqs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX faqs_category_idx ON public.faqs(category_id);
CREATE INDEX faqs_priority_idx ON public.faqs(priority_score DESC);
CREATE INDEX faqs_embedding_idx ON public.faqs USING hnsw (embedding vector_cosine_ops);

-- Votes
CREATE TABLE public.faq_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faq_id uuid NOT NULL REFERENCES public.faqs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (faq_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faq_votes TO authenticated;
GRANT ALL ON public.faq_votes TO service_role;
ALTER TABLE public.faq_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own votes" ON public.faq_votes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users manage own votes" ON public.faq_votes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User-submitted queries ("Raise a query")
CREATE TABLE public.user_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  question text NOT NULL,
  context text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','answered','closed')),
  admin_answer text,
  linked_faq_id uuid REFERENCES public.faqs(id) ON DELETE SET NULL,
  category_hint text,
  upvotes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.user_queries TO authenticated;
GRANT SELECT ON public.user_queries TO anon;
GRANT ALL ON public.user_queries TO service_role;
ALTER TABLE public.user_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Queries readable by all" ON public.user_queries FOR SELECT USING (true);
CREATE POLICY "Users create own queries" ON public.user_queries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage queries" ON public.user_queries FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Search logs (for trending)
CREATE TABLE public.search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  matched_faq_id uuid REFERENCES public.faqs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.search_logs TO anon, authenticated;
GRANT SELECT ON public.search_logs TO authenticated;
GRANT ALL ON public.search_logs TO service_role;
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can log searches" ON public.search_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins view search logs" ON public.search_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Semantic search RPC
CREATE OR REPLACE FUNCTION public.match_faqs(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  min_similarity float DEFAULT 0.2
)
RETURNS TABLE (
  id uuid,
  question text,
  answer text,
  category_id uuid,
  similarity float
) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT f.id, f.question, f.answer, f.category_id,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM public.faqs f
  WHERE f.embedding IS NOT NULL AND f.is_published = true
    AND 1 - (f.embedding <=> query_embedding) > min_similarity
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Vote handler updates counts + priority
CREATE OR REPLACE FUNCTION public.recompute_faq_priority(_faq_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.faqs SET priority_score =
    (0.4 * ln(1 + view_count) + 0.6 * ln(1 + search_count) + 0.8 * downvotes - 0.3 * upvotes)
  WHERE id = _faq_id;
END; $$;

CREATE OR REPLACE FUNCTION public.on_vote_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tgt uuid;
BEGIN
  tgt := COALESCE(NEW.faq_id, OLD.faq_id);
  UPDATE public.faqs SET
    upvotes = (SELECT count(*) FROM public.faq_votes WHERE faq_id = tgt AND value = 1),
    downvotes = (SELECT count(*) FROM public.faq_votes WHERE faq_id = tgt AND value = -1)
  WHERE id = tgt;
  PERFORM public.recompute_faq_priority(tgt);
  RETURN NULL;
END; $$;
CREATE TRIGGER faq_votes_after_change AFTER INSERT OR UPDATE OR DELETE ON public.faq_votes
FOR EACH ROW EXECUTE FUNCTION public.on_vote_change();

CREATE OR REPLACE FUNCTION public.increment_faq_view(_faq_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.faqs SET view_count = view_count + 1 WHERE id = _faq_id;
  PERFORM public.recompute_faq_priority(_faq_id);
END; $$;

CREATE OR REPLACE FUNCTION public.increment_faq_search(_faq_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.faqs SET search_count = search_count + 1 WHERE id = _faq_id;
  PERFORM public.recompute_faq_priority(_faq_id);
END; $$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER faqs_updated_at BEFORE UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER user_queries_updated_at BEFORE UPDATE ON public.user_queries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- File: 20260708045826_402c78f1-39af-4b85-b54b-8c868b793215.sql

CREATE TABLE public.faq_embed_staging (
  faq_id uuid PRIMARY KEY,
  emb vector(1536) NOT NULL
);
GRANT INSERT, SELECT ON public.faq_embed_staging TO authenticated, anon, service_role;
ALTER TABLE public.faq_embed_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open staging" ON public.faq_embed_staging FOR ALL USING (true) WITH CHECK (true);


-- File: 20260708045930_09a4a78f-9627-4816-9721-e5282e2e9689.sql

UPDATE public.faqs f SET embedding = s.emb FROM public.faq_embed_staging s WHERE f.id = s.faq_id;
DROP TABLE public.faq_embed_staging;


-- File: 20260708071809_de878ee5-4770-4ff8-86b8-cfd19686ae0f.sql

-- 1. Profiles: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- 2. user_queries: owner or admin only
DROP POLICY IF EXISTS "Queries readable by all" ON public.user_queries;
CREATE POLICY "Queries readable by owner or admin" ON public.user_queries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 3. search_logs: remove always-true insert; only service_role/admin insert via server fn
DROP POLICY IF EXISTS "Anyone can log searches" ON public.search_logs;
CREATE POLICY "Admins can log searches" ON public.search_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Fix set_updated_at search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 5. has_role -> SECURITY INVOKER (safe: only queries own row)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- 6. match_faqs -> SECURITY INVOKER (only reads published faqs which are publicly readable)
CREATE OR REPLACE FUNCTION public.match_faqs(query_embedding vector, match_count integer DEFAULT 5, min_similarity double precision DEFAULT 0.2)
RETURNS TABLE(id uuid, question text, answer text, category_id uuid, similarity double precision)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT f.id, f.question, f.answer, f.category_id,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM public.faqs f
  WHERE f.embedding IS NOT NULL AND f.is_published = true
    AND 1 - (f.embedding <=> query_embedding) > min_similarity
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 7. Revoke EXECUTE on SECURITY DEFINER helpers from public roles
REVOKE EXECUTE ON FUNCTION public.increment_faq_view(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_faq_search(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_faq_priority(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_vote_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- File: 20260708082928_98fa13ed-c7ca-468a-8c5b-e830e8c8cc17.sql

-- Public read of avatars; owners (folder = auth.uid()) can write/update/delete their own
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- File: 20260708093149_df288f30-f420-49e2-bcd7-d2e528890880.sql

-- BOOKMARKS
CREATE TABLE public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  faq_id uuid NOT NULL REFERENCES public.faqs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, faq_id)
);
GRANT SELECT, INSERT, DELETE ON public.bookmarks TO authenticated;
GRANT ALL ON public.bookmarks TO service_role;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bookmarks" ON public.bookmarks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX bookmarks_user_idx ON public.bookmarks(user_id, created_at DESC);

-- FAQ COMMENTS
CREATE TABLE public.faq_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faq_id uuid NOT NULL REFERENCES public.faqs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faq_comments TO authenticated;
GRANT ALL ON public.faq_comments TO service_role;
ALTER TABLE public.faq_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments readable to signed-in users" ON public.faq_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create own comments" ON public.faq_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own comments" ON public.faq_comments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own or admin" ON public.faq_comments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX faq_comments_faq_idx ON public.faq_comments(faq_id, created_at DESC);
CREATE TRIGGER faq_comments_updated_at BEFORE UPDATE ON public.faq_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);

-- Trigger: notify query owner when admin posts an answer
CREATE OR REPLACE FUNCTION public.notify_on_query_answered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL
     AND NEW.admin_answer IS NOT NULL
     AND (OLD.admin_answer IS NULL OR OLD.admin_answer <> NEW.admin_answer)
  THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'query_answered',
      'Your query was answered',
      left(NEW.admin_answer, 200),
      '/dashboard'
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_queries_notify_answer
  AFTER UPDATE ON public.user_queries
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_query_answered();


-- File: 20260708112311_946fa3bd-a77e-4227-a039-fd0c3ad4d090.sql

CREATE TABLE public.admin_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_activity_logs_created_at_idx ON public.admin_activity_logs (created_at DESC);
CREATE INDEX admin_activity_logs_action_idx ON public.admin_activity_logs (action);

GRANT SELECT ON public.admin_activity_logs TO authenticated;
GRANT ALL ON public.admin_activity_logs TO service_role;

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activity logs"
ON public.admin_activity_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));


-- File: 20260708123319_19fae280-7a62-4ca5-aff0-8f54d70fb5c7.sql

-- Profiles: restrict SELECT to owner (and admins)
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- FAQ comments: only comments on published FAQs
DROP POLICY IF EXISTS "Comments readable to signed-in users" ON public.faq_comments;
CREATE POLICY "Comments readable on published faqs" ON public.faq_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.faqs f WHERE f.id = faq_comments.faq_id AND f.is_published = true)
    OR auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
  );

-- Avatars: replace public read with owner-only read
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Users can read their own avatar" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated where not needed
REVOKE EXECUTE ON FUNCTION public.increment_faq_view(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.increment_faq_search(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.recompute_faq_priority(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.on_vote_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_on_query_answered() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;

-- has_role is called via RPC by signed-in users; keep authenticated, remove anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;


-- File: 20260708124725_7a739212-f732-450f-a945-1f2689603ed2.sql
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

-- File: 20260709053723_b291d868-cc31-43b8-bbfd-ec2d48358e5e.sql

-- ============ COURSES ============
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  cover_url text,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courses viewable by authenticated when published or admin"
  ON public.courses FOR SELECT TO authenticated
  USING (is_published = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "courses admins can insert" ON public.courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "courses admins can update" ON public.courses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "courses admins can delete" ON public.courses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ COURSE MODULES ============
CREATE TABLE public.course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_course_modules_course ON public.course_modules(course_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_modules TO authenticated;
GRANT ALL ON public.course_modules TO service_role;
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modules viewable when parent course viewable"
  ON public.course_modules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id
                 AND (c.is_published = true OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "modules admins can insert" ON public.course_modules FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "modules admins can update" ON public.course_modules FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "modules admins can delete" ON public.course_modules FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_course_modules_updated_at BEFORE UPDATE ON public.course_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ENROLLMENTS ============
CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  progress_pct integer NOT NULL DEFAULT 0,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, course_id)
);
CREATE INDEX idx_enrollments_user ON public.enrollments(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enrollments users read own or admin" ON public.enrollments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "enrollments users insert own" ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "enrollments users update own or admin" ON public.enrollments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "enrollments users delete own or admin" ON public.enrollments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ============ MODULE PROGRESS ============
CREATE TABLE public.module_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_id)
);
CREATE INDEX idx_module_progress_user ON public.module_progress(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_progress TO authenticated;
GRANT ALL ON public.module_progress TO service_role;
ALTER TABLE public.module_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress users read own or admin" ON public.module_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "progress users insert own" ON public.module_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "progress users delete own" ON public.module_progress FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============ TIMELINE EVENTS ============
CREATE TABLE public.timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_timeline_user_created ON public.timeline_events(user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.timeline_events TO authenticated;
GRANT ALL ON public.timeline_events TO service_role;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "timeline users read own or admin" ON public.timeline_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "timeline users insert own" ON public.timeline_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "timeline users delete own" ON public.timeline_events FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============ FEATURE FLAGS ============
CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "flags admin all" ON public.feature_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_flags_updated_at BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ APP SETTINGS ============
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings admin all" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- File: 20260709055653_a5ce2cb8-e07d-4667-942c-bd412fdbf370.sql
-- COMMUNITY POSTS
CREATE TABLE public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'discussion',
  status text NOT NULL DEFAULT 'published',
  tags text[] NOT NULL DEFAULT '{}',
  upvotes int NOT NULL DEFAULT 0,
  comment_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts TO authenticated;
GRANT SELECT ON public.community_posts TO anon;
GRANT ALL ON public.community_posts TO service_role;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts read published" ON public.community_posts FOR SELECT USING (status = 'published' OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "posts insert own" ON public.community_posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "posts update own or admin" ON public.community_posts FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "posts delete own or admin" ON public.community_posts FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER community_posts_updated BEFORE UPDATE ON public.community_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- COMMENTS
CREATE TABLE public.community_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_post_comments TO authenticated;
GRANT SELECT ON public.community_post_comments TO anon;
GRANT ALL ON public.community_post_comments TO service_role;
ALTER TABLE public.community_post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpc read" ON public.community_post_comments FOR SELECT USING (true);
CREATE POLICY "cpc insert own" ON public.community_post_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "cpc delete own or admin" ON public.community_post_comments FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- VOTES
CREATE TABLE public.community_post_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_post_votes TO authenticated;
GRANT ALL ON public.community_post_votes TO service_role;
ALTER TABLE public.community_post_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpv self" ON public.community_post_votes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.on_community_vote_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tgt uuid;
BEGIN
  tgt := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE public.community_posts SET upvotes = COALESCE((SELECT SUM(value) FROM public.community_post_votes WHERE post_id = tgt), 0) WHERE id = tgt;
  RETURN NULL;
END; $$;
CREATE TRIGGER cpv_after_change AFTER INSERT OR UPDATE OR DELETE ON public.community_post_votes FOR EACH ROW EXECUTE FUNCTION public.on_community_vote_change();

CREATE OR REPLACE FUNCTION public.on_community_comment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tgt uuid;
BEGIN
  tgt := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE public.community_posts SET comment_count = (SELECT count(*) FROM public.community_post_comments WHERE post_id = tgt) WHERE id = tgt;
  RETURN NULL;
END; $$;
CREATE TRIGGER cpc_after_change AFTER INSERT OR DELETE ON public.community_post_comments FOR EACH ROW EXECUTE FUNCTION public.on_community_comment_change();

-- SUPPORT CATEGORIES
CREATE TABLE public.support_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_categories TO anon, authenticated;
GRANT ALL ON public.support_categories TO service_role;
ALTER TABLE public.support_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supcat read" ON public.support_categories FOR SELECT USING (true);
CREATE POLICY "supcat admin write" ON public.support_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- SUPPORT REQUESTS
CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.support_categories(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_response text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_requests TO authenticated;
GRANT ALL ON public.support_requests TO service_role;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sr read own or admin" ON public.support_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sr insert own" ON public.support_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "sr update own or admin" ON public.support_requests FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sr delete own or admin" ON public.support_requests FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER support_requests_updated BEFORE UPDATE ON public.support_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_community_posts_created ON public.community_posts(created_at DESC);
CREATE INDEX idx_cpc_post ON public.community_post_comments(post_id);
CREATE INDEX idx_sr_user ON public.support_requests(user_id, created_at DESC);
CREATE INDEX idx_sr_status ON public.support_requests(status);

-- File: 20260709055717_c559ce47-d4b7-4251-996b-0e5865cf0fa4.sql
REVOKE EXECUTE ON FUNCTION public.on_community_vote_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_community_comment_change() FROM PUBLIC, anon, authenticated;

-- File: 20260709061847_cd1ef681-c8ef-4c30-95c5-1eeb4aa4698c.sql
create table if not exists public.site_alerts (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  tone text not null default 'info' check (tone in ('info','success','warning','danger')),
  active boolean not null default true,
  link_url text,
  link_label text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

grant select on public.site_alerts to anon, authenticated;
grant all on public.site_alerts to service_role;

alter table public.site_alerts enable row level security;

create policy "Public reads active alerts"
  on public.site_alerts for select
  to anon, authenticated
  using (active = true and (expires_at is null or expires_at > now()));

create policy "Admins manage alerts"
  on public.site_alerts for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create index if not exists site_alerts_active_idx on public.site_alerts (active, expires_at);

-- File: 20260709064123_2a47efc0-cb60-42a7-a59c-bdf2ad2ee03d.sql
DROP POLICY IF EXISTS "cpc read" ON public.community_post_comments;

CREATE POLICY "cpc read visible posts" ON public.community_post_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = community_post_comments.post_id
      AND (
        p.status = 'published'
        OR p.user_id = auth.uid()
        OR community_post_comments.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

-- File: 20260709125133_fbd96714-371f-41fd-9e43-bafc7c84e9f6.sql
DROP POLICY "posts update own or admin" ON public.community_posts;
CREATE POLICY "posts update own or admin" ON public.community_posts FOR UPDATE
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "sr update own or admin" ON public.support_requests;
CREATE POLICY "sr update own or admin" ON public.support_requests FOR UPDATE
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- File: 20260709130506_cca5e8eb-970e-4b3a-90ac-3571beabc7f8.sql

DROP POLICY "posts read published" ON public.community_posts;
CREATE POLICY "posts read published" ON public.community_posts FOR SELECT TO authenticated USING ((status = 'published'::text) OR (user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "posts update own or admin" ON public.community_posts;
CREATE POLICY "posts update own or admin" ON public.community_posts FOR UPDATE TO authenticated USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)) WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "cpc read visible posts" ON public.community_post_comments;
CREATE POLICY "cpc read visible posts" ON public.community_post_comments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM community_posts p WHERE p.id = community_post_comments.post_id AND (p.status = 'published' OR p.user_id = auth.uid() OR community_post_comments.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY "sr update own or admin" ON public.support_requests;
CREATE POLICY "sr update own or admin" ON public.support_requests FOR UPDATE TO authenticated USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)) WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));


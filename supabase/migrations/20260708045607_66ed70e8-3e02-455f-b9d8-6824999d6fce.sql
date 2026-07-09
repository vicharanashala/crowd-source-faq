
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

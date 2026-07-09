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

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

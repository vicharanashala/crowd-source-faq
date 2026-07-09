
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

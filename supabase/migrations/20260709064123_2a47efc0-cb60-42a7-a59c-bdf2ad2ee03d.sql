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
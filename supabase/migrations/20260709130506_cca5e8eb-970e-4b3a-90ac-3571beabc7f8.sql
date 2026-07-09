
DROP POLICY "posts read published" ON public.community_posts;
CREATE POLICY "posts read published" ON public.community_posts FOR SELECT TO authenticated USING ((status = 'published'::text) OR (user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "posts update own or admin" ON public.community_posts;
CREATE POLICY "posts update own or admin" ON public.community_posts FOR UPDATE TO authenticated USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)) WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "cpc read visible posts" ON public.community_post_comments;
CREATE POLICY "cpc read visible posts" ON public.community_post_comments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM community_posts p WHERE p.id = community_post_comments.post_id AND (p.status = 'published' OR p.user_id = auth.uid() OR community_post_comments.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY "sr update own or admin" ON public.support_requests;
CREATE POLICY "sr update own or admin" ON public.support_requests FOR UPDATE TO authenticated USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)) WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

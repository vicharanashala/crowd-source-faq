DROP POLICY "posts update own or admin" ON public.community_posts;
CREATE POLICY "posts update own or admin" ON public.community_posts FOR UPDATE
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "sr update own or admin" ON public.support_requests;
CREATE POLICY "sr update own or admin" ON public.support_requests FOR UPDATE
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
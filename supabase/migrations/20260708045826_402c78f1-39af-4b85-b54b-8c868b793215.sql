
CREATE TABLE public.faq_embed_staging (
  faq_id uuid PRIMARY KEY,
  emb vector(1536) NOT NULL
);
GRANT INSERT, SELECT ON public.faq_embed_staging TO authenticated, anon, service_role;
ALTER TABLE public.faq_embed_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open staging" ON public.faq_embed_staging FOR ALL USING (true) WITH CHECK (true);

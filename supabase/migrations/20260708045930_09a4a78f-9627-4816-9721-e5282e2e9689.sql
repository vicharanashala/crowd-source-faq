
UPDATE public.faqs f SET embedding = s.emb FROM public.faq_embed_staging s WHERE f.id = s.faq_id;
DROP TABLE public.faq_embed_staging;

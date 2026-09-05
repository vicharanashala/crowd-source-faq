import api from '../../utils/api';
import { usePublicGet } from '../explore/usePublicFaqApi';
import type { FaqSatisfactionResponse } from '../explore/types';

export function useFaqSatisfaction(faqId: string | null) {
  return usePublicGet<FaqSatisfactionResponse>(
    faqId ? `/faq/${faqId}/satisfaction` : null
  );
}
export async function submitFaqSatisfaction(
  faqId: string,
  rating: number,
): Promise<FaqSatisfactionResponse> {
  const res = await api.post<FaqSatisfactionResponse>(
    `/faq/${faqId}/satisfaction`,
    { rating },
  );
  return res.data;
}
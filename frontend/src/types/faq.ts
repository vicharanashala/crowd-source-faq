export interface Faq {
  _id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FaqResponse {
  success: boolean;
  data: Faq | Faq[];
}

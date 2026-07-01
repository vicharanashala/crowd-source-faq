/**
 * Course — v1.69
 *
 * Mirrors the backend model at `backend/models/Course.ts`. A
 * Course is a selectable training unit WITHIN an Internship
 * (Batch). The home page renders a course picker; the user's
 * selection scopes the rest of the home page (Popular / Recent /
 * Categories cards + the category accordion) to that course's
 * FAQs.
 */

export interface Course {
  _id: string;
  batchId: string;
  name: string;
  slug: string;
  description: string;
  order: number;
  isActive: boolean;
  icon?: string | null;
  faqCount: number;
}

export interface CoursesResponse {
  courses: Course[];
}

/**
 * Public hook to fetch the courses in a given program (batch).
 * Returns the active courses in `order` ascending, with a
 * `faqCount` for each. `null` `batchId` = no fetch.
 */

import { useMemo } from 'react';
import type { Course, CoursesResponse } from '../../types/course';
import { usePublicGet } from './usePublicFaqApi';

export function useCourses(batchId: string | null) {
  const params = useMemo(() => (batchId ? { batchId } : undefined), [batchId]);
  // v1.69 — usePublicGet returns { data, loading, error } so we
  // can drop straight into the existing Explore page chrome.
  return usePublicGet<CoursesResponse>(batchId ? '/courses' : null, params) as {
    data: CoursesResponse | null;
    loading: boolean;
    error: string | null;
  } & { data: { courses: Course[] } | null };
}

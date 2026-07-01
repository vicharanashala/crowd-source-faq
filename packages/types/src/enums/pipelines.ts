// ── Pipeline Names ───────────────────────────────────────────────
export const PipelineName = {
  AUTO_ANSWER: 'auto_answer',
  FAQ_AUDIT: 'faq_audit',
  DUPLICATE_DETECTION: 'duplicate_detection',
  ZOOM_EXTRACTION: 'zoom_extraction',
  DOCUMENT_EXTRACTION: 'document_extraction',
  PROMOTION: 'promotion',
  FRESHNESS_CHECK: 'freshness_check',
  CATEGORY_CLUSTER: 'category_cluster',
} as const;

export type PipelineName = (typeof PipelineName)[keyof typeof PipelineName];

// ── Pipeline Verdicts ────────────────────────────────────────────
export const PipelineVerdict = {
  APPROVED: 'approved',
  QUEUED: 'queued',
  REJECTED: 'rejected',
  SKIPPED: 'skipped',
} as const;

export type PipelineVerdict = (typeof PipelineVerdict)[keyof typeof PipelineVerdict];

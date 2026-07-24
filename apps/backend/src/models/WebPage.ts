/**
 * WebPage — Phase 5, extended in Phase 8.
 *
 * Admin-pasted URLs and auto-discovered URLs that the auto-answer
 * context retriever can pull into its fan-out.
 *
 * Two `source` values:
 *  - `admin_pasted` — admins explicitly added the URL via
 *    `POST /admin/web-pages`. Pre-approved at insertion time
 *    (`approved: true`) because the admin already reviewed it.
 *  - `auto_discovered` — the webCrawler cron fetched a seed URL
 *    and inserted it with `approved: false`. An admin must
 *    PATCH /admin/web-pages/:id/approve before it surfaces in
 *    the retrieval fan-out.
 *
 * Schema notes
 * ------------
 *  - `url` is stored verbatim (after `.trim()`); we do NOT canonicalize
 *    case or strip trailing slashes. Mongo's `unique` index on `url`
 *    treats the field as a literal string, so admins who paste the
 *    same URL with a different trailing slash get two rows — that's a
 *    deliberate product decision (let the admin decide what's canonical).
 *  - `domain` is denormalized from `new URL(url).hostname` at write
 *    time. Indexed so the admin view can group by domain and the
 *    cleanup cron can age out per-domain.
 *  - The text index weights `title` at 10 and `text` at 2 — page
 *    titles are strong relevance signals, body text is the bulk of
 *    the matchable content.
 *  - `lastFetchError` is non-null when the last `fetchAndExtract` call
 *    failed (4xx/5xx, oversized, non-HTML). The retrieval source
 *    excludes any row where this is set so we don't surface broken
 *    links to users.
 *  - `approved` (Phase 8) gates the retrieval source. The
 *    webTextSource filter requires `approved: true` so unapproved
 *    auto-discovered rows never bleed into the context window.
 *  - No `batchId` field — web pages are GLOBAL. The retrieval source
 *    can accept a `batchId` filter (it will be a no-op on this
 *    collection, since WebPage documents don't carry one).
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type WebPageSource = 'admin_pasted' | 'auto_discovered';

export interface IWebPage extends Document {
  url: string;
  domain: string;
  title: string;
  text: string;
  source: WebPageSource;
  statusCode: number;
  lastFetchError: string | null;
  fetchedAt: Date;
  approved: boolean;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const webPageSchema = new MongooseSchema<IWebPage>(
  {
    url: {
      type: String,
      required: [true, 'url is required'],
      unique: true,
      trim: true,
      maxlength: 2048,
    },
    domain: {
      type: String,
      required: [true, 'domain is required'],
      index: true,
      trim: true,
      maxlength: 255,
    },
    title: {
      type: String,
      default: '',
      maxlength: 500,
    },
    text: {
      type: String,
      required: [true, 'text is required'],
    },
    source: {
      type: String,
      enum: ['admin_pasted', 'auto_discovered'] as WebPageSource[],
      required: [true, 'source is required'],
      default: 'admin_pasted',
      index: true,
    },
    approved: {
      type: Boolean,
      default: false,
      index: true,
    },
    statusCode: {
      type: Number,
      default: 200,
    },
    lastFetchError: {
      type: String,
      default: null,
    },
    fetchedAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    createdBy: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

// Primary retrieval path — weighted text index on title (10) + text (2).
// Title matches should rank higher because they're stronger relevance signals.
webPageSchema.index(
  { title: 'text', text: 'text' },
  { weights: { title: 10, text: 2 }, name: 'web_page_text' },
);

// Admin-view hot path: per-domain, most-recent first. Used by the
// admin list endpoint and a future per-domain cleanup cron.
webPageSchema.index(
  { domain: 1, fetchedAt: -1 },
  { name: 'web_page_domain_fetchedAt' },
);

export default mongoose.model<IWebPage>(
  'WebPage',
  webPageSchema,
  'yaksha_web_pages',
);

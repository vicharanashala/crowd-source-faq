// ── Application Constants ────────────────────────────────────────
// Shared constants that both frontend and backend reference.
// Keep this file small — domain-specific constants belong in
// their respective packages or config.yaml.

export const APP_NAME = 'Crowd Source FAQ';
export const APP_VERSION = '0.1.0';

// ── Pagination Defaults ──────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ── Content Limits ───────────────────────────────────────────────
export const MAX_TITLE_LENGTH = 200;
export const MAX_BODY_LENGTH = 5000;
export const MAX_COMMENT_LENGTH = 2000;

// ── LocalStorage Keys ────────────────────────────────────────────
export const STORAGE_TOKEN_KEY = 'yaksha_token';
export const STORAGE_USER_KEY = 'yaksha_user';
export const STORAGE_FIRST_VISIT_KEY = 'yaksha_first_visit_prompt_seen';

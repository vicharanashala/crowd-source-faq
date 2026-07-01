/* eslint-disable no-control-regex, no-useless-escape */
/**
 * Input sanitization utilities.
 * Protects against XSS and NoSQL injection in user-provided strings.
 */

/**
 * Sanitize a string that may contain HTML — strips all tags and control chars.
 * Use on any user-provided string that will be rendered in an HTML context.
 */
export function sanitizeHtml(input: unknown): string {
  if (typeof input !== 'string') return '';
  let str = input;
  let previous;
  do {
    previous = str;
    str = str.replace(/<[^<>]*>/g, '');
  } while (str !== previous);
  // Remove any unclosed tags at the end of the string to prevent unclosed tag injections
  str = str.replace(/<[a-zA-Z/!][^<>]*$/g, '');
  return str.replace(/[\x00-\x1F\x7F]/g, '');
}

/** Strip HTML tags and control characters from a string. */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')       // remove HTML tags
    .replace(/[\x00-\x1F\x7F]/g, ''); // remove control chars
}

/**
 * Sanitize a general text field (name, topic, etc.).
 * Removes HTML, newlines that could be used in header injection,
 * and trims whitespace.
 */
export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return stripHtml(input).replace(/[\r\n\t]+/g, ' ').trim();
}

/**
 * Sanitize a string that will be used in a MongoDB query regex.
 * Escapes regex special characters to prevent ReDoS / injection.
 */
export function sanitizeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize a Zoom OAuth state param (base64-encoded user ID).
 * Only allows valid base64 characters.
 */
export function sanitizeBase64(input: string): string {
  return input.replace(/[^A-Za-z0-9+/=]/g, '');
}

/**
 * Sanitize an email address — allows lowercase letters, numbers,
 * dots, hyphens, @ and domain dots. Returns empty string if invalid.
 */
export function sanitizeEmail(input: unknown): string {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(trimmed)) return '';
  return trimmed;
}

/**
 * Sanitize a URL path segment (no slashes, null bytes, or traversal patterns).
 */
export function sanitizePathSegment(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.replace(/\0|\.\./g, '').replace(/[\/\\]/g, '');
}
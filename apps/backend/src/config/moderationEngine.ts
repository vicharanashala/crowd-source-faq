// config/moderationEngine.ts
//
// Soft-censorship text moderation engine.
//
// Accepts the user's raw text and returns a transformed string where
// blacklisted words (e.g. "fuck" → "****") are masked. Original casing and
// leetspeak variants (f*ck, f u c k) are caught by the recommended
// transformers shipped with `obscenity`.
//
// This is the soft-censorship pattern: the request still succeeds, the
// text still lands in MongoDB, but profanity is masked at write time so
// every reader sees the sanitized version. The hard-block pattern (400
// Bad Request) is intentionally not used here — see the post creation
// route's Zod validator for the hard-block check on length.
//
// Engine state (matcher + censor) is built once at module load and shared
// across every request. Safe to keep global because `obscenity` is
// stateless after construction.

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
  TextCensor,
  asteriskCensorStrategy,
} from 'obscenity';

// 1. State-machine matcher — bundles the curated English profanity list
//    and the recommended transformers (catches leetspeak, character
//    substitution, and spaced-out variants automatically).
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// 2. Visual transformer — replaces each matched range with the same
//    number of asterisks. Cached as a strategy so we don't reallocate
//    the closure on every call.
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

/**
 * Soft-censor any profanity in a free-text user input.
 *
 * Behaviour:
 *  - Returns `''` for non-string or empty input.
 *  - Returns the original text unchanged when no profanity is detected
 *    (avoids allocating a new string for the common case).
 *  - Otherwise returns the input with each blacklisted range replaced
 *    by asterisks of the same length.
 *
 * @param text - Raw user input (post title, post body, comment body, …).
 * @returns Sanitized text safe to persist to MongoDB.
 */
const moderateText = (text: unknown): string => {
  if (typeof text !== 'string' || text.length === 0) return '';
  const matches = matcher.getAllMatches(text);
  if (matches.length === 0) return text;
  return censor.applyTo(text, matches);
};

export { moderateText, matcher };

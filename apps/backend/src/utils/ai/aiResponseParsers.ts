/**
 * aiResponseParsers — shared utilities for parsing AI model
 * responses that are nominally JSON but in practice come wrapped
 * in:
 *   - ```json\n{...}\n``` fences
 *   - <think>…</think> chain-of-thought blocks
 *   - leading prose like "Here is the result: {…}"
 *   - or just the bare JSON
 *
 * Both the document AI pipeline (`utils/ai/documentAiPipeline.ts`)
 * and the FAQ audit controller (`controllers/faqAuditController.ts`)
 * use this — kept as a shared util so the two callers stay in sync.
 */

/**
 * Strip common wrapper formats the model emits:
 *  - <think>…</think> (chain-of-thought)
 *  - ```json fences
 *  - leading prose before the first `{`
 */
export function stripAllWrappers(s: string): string {
  let out = s;
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const fenceMatch = out.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) out = fenceMatch[1];
  const firstBrace = out.indexOf('{');
  if (firstBrace > 0) out = out.slice(firstBrace);
  return out.trim();
}

/**
 * Find the outermost JSON object in a string by brace-counting.
 * Returns the `{…}` substring (first `{` to matching `}`), or
 * null if no `{` is present or braces are unbalanced.
 */
export function extractJsonSubstring(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

// Highlight matching keywords in a string with <mark> elements.
// Used by the search results and inline matches in the explore page.

import React from 'react';

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;

export function escapeRegExp(s: string): string {
  return s.replace(ESCAPE_RE, '\\$&');
}

export interface HighlightOptions {
  /** Pre-built regex (skips re-compilation if you reuse it). */
  regex?: RegExp;
  /** Case-sensitive (default: false). */
  caseSensitive?: boolean;
  /** Wrapper element / className. Defaults to <mark className="...">. */
  className?: string;
}

/**
 * Splits a string into an array of React nodes, wrapping any substring
 * that matches `pattern` in a <mark>. Safe for arbitrary user input
 * because we never use dangerouslySetInnerHTML — every fragment is a
 * plain text node.
 */
export function highlightMatch(
  text: string,
  query: string,
  options: HighlightOptions = {},
): React.ReactNode {
  if (!text) return '';
  const q = query.trim();
  if (!q) return text;

  const regex =
    options.regex ??
    new RegExp(escapeRegExp(q), options.caseSensitive ? 'g' : 'gi');
  // ensure global flag
  const re = regex.flags.includes('g') ? regex : new RegExp(regex.source, regex.flags + 'g');

  const className = options.className ?? 'bg-accent/15 text-accent px-0.5 rounded font-medium';
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    parts.push(
      React.createElement('mark', { key: `${m.index}-${m[0]}`, className }, m[0]),
    );
    lastIndex = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++; // safety against zero-width matches
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

/** Truncate a string on a word boundary near `max` chars and add ellipsis. */
export function preview(text: string, max: number): string {
  if (!text) return '';
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
}

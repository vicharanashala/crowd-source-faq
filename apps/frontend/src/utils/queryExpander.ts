/**
 * queryExpander.ts - Frontend utility for displaying search query expansions
 * This mirrors the backend aliasMapper logic for UI feedback purposes
 */

// Manual alias map from backend aliases.json
const aliasMap = new Map<string, string>([
  ['noc', 'no objection certificate'],
  ['no objection certificate', 'noc'],
  ['vins', 'vicharanashala internship'],
  ['vicharanashala internship', 'vins'],
  ['faq', 'frequently asked questions'],
  ['frequently asked questions', 'faq'],
  ['hod', 'head of department'],
  ['head of department', 'hod'],
  ['llm', 'large language model'],
  ['large language model', 'llm'],
  ['ml', 'machine learning'],
  ['machine learning', 'ml'],
  ['ai', 'artificial intelligence'],
  ['artificial intelligence', 'ai'],
  ['github', 'git repository'],
  ['git repository', 'github'],
  ['discord', 'community server'],
  ['community server', 'discord'],
  ['yaksha', 'yaksha ai assistant'],
  ['yaksha ai assistant', 'yaksha'],
  ['samagama', 'internship portal'],
  ['internship portal', 'samagama'],
  ['offer letter', 'internship offer letter'],
  ['internship offer letter', 'offer letter'],
  ['joining letter', 'offer letter'],
  ['vicharnashala', 'vicharanashala'],
  ['no object certificate', 'no objection certificate'],
  ['machin learning', 'machine learning'],
  ['iit', 'indian institute of technology'],
  ['indian institute of technology', 'iit'],
  ['iit ropar', 'indian institute of technology ropar'],
  ['vibe', 'vibe lms'],
  ['lms', 'learning management system'],
  ['learning management system', 'lms'],
  ['noc letter', 'no objection certificate'],
  ['project', 'open source project'],
  ['open source', 'open source project'],
  ['mentor', 'vicharanashala mentor'],
  ['certificate', 'internship certificate'],
  ['phase 1', 'bronze phase coursework'],
  ['phase 2', 'silver phase project'],
  ['bronze', 'phase 1 coursework'],
  ['silver', 'phase 2 project'],
  ['spurti', 'spurti points'],
  ['spurti points', 'internship points rewards'],
  ['rosetta', 'internship journal rosetta'],
  ['gpu', 'graphics processing unit'],
  ['graphics processing unit', 'gpu'],
  ['api', 'application programming interface'],
  ['application programming interface', 'api'],
  ['ui', 'user interface'],
  ['user interface', 'ui'],
  ['ux', 'user experience'],
  ['user experience', 'ux'],
  ['pr', 'pull request'],
  ['pull request', 'pr'],
  ['os', 'open source'],
  ['git', 'version control'],
  ['version control', 'git'],
]);

/**
 * Get expansion suggestions for a query (for UI display only)
 * Note: The actual expansion happens on the backend
 */
export function getQueryExpansions(query: string): string[] {
  if (!query || !query.trim()) return [];

  const expansions: string[] = [];
  const seenExpansions = new Set<string>();
  const originalTermsLower = new Set(query.toLowerCase().split(/\s+/).filter(Boolean));

  function tryExpand(lookupKey: string): void {
    const expansion = aliasMap.get(lookupKey);
    if (!expansion) return;

    const expansionLower = expansion.toLowerCase();
    const expansionWords = expansionLower.split(/\s+/);
    const alreadyInQuery = expansionWords.every((w) => originalTermsLower.has(w));
    if (alreadyInQuery) return;

    if (seenExpansions.has(expansionLower)) return;
    seenExpansions.add(expansionLower);

    const titleCased = expansion
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    expansions.push(titleCased);
  }

  // Token-level lookup
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    tryExpand(token.toLowerCase());
  }

  // Phrase-level lookup (2-5 tokens)
  const MAX_PHRASE_TOKENS = 5;
  for (let start = 0; start < tokens.length; start++) {
    for (let len = 2; len <= Math.min(MAX_PHRASE_TOKENS, tokens.length - start); len++) {
      const phrase = tokens
        .slice(start, start + len)
        .map((t) => t.toLowerCase())
        .join(' ');
      tryExpand(phrase);
    }
  }

  return expansions;
}

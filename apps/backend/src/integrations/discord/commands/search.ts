/**
 * bot/commands/search.ts — /search <query>
 *
 * Public. Calls POST {PUBLIC_URL}/api/search, returns the
 * top 3 results as a single embed with question / category
 * / vector+text score / snippet.
 *
 * v1.69 — Phase 6+ per-guild → batchId routing.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { BotConfig } from '../discordBot.js';
import { buildBotApiUrl, botApiHeaders } from '../events/botApi.js';

export const searchCommandData = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search the FAQ + community + knowledge base')
  .addStringOption((o) =>
    o.setName('query')
      .setDescription('What to search for')
      .setRequired(true)
      .setMaxLength(200)
  )
  .addIntegerOption((o) =>
    o.setName('limit')
      .setDescription('How many results to show (1-10, default 3)')
      .setMinValue(1)
      .setMaxValue(10)
  )
  .toJSON();

interface SearchResult {
  question: string;
  answer?: string;
  category?: string;
  source?: 'faq' | 'community' | 'knowledge';
  score?: number;
  vectorScore?: number;
  textScore?: number;
  rrfScore?: number;
  _id?: string;
}

export async function executeSearch(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
  batchId: string | null = null
): Promise<void> {
  const query = interaction.options.getString('query', true);
  const limit = interaction.options.getInteger('limit') ?? 3;
  await interaction.deferReply();

  let results: SearchResult[] = [];
  try {
    const res = await fetch(buildBotApiUrl(config, '/csfaq/api/search', batchId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...botApiHeaders(config, batchId) },
      body: JSON.stringify({ query, topK: limit }),
    });
    if (res.ok) {
      const data = await res.json() as { results?: SearchResult[] };
      results = data.results ?? [];
    } else {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    await interaction.followUp({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Search failed')
        .setDescription((err as Error).message.slice(0, 1000))],
    });
    return;
  }

  if (results.length === 0) {
    await interaction.followUp({
      embeds: [new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('No results')
        .setDescription(`No matches for **${query.slice(0, 80)}**. Try \`/ask ${query.slice(0, 80)}\` for an AI-synthesized answer.`)],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`Top ${results.length} results for: ${query.slice(0, 80)}`)
    .setTimestamp(new Date());

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const score = r.score ?? r.rrfScore ?? r.vectorScore ?? 0;
    const category = r.category ? ` _[${r.category}]_` : '';
    const answer = (r.answer ?? '').slice(0, 240);
    embed.addFields({
      name: `${i + 1}. ${r.question.slice(0, 200)}${category}`,
      value: `${answer}${answer.length === 240 ? '…' : ''}\n*score:* \`${score.toFixed(3)}\``,
    });
  }
  await interaction.followUp({ embeds: [embed] });
}

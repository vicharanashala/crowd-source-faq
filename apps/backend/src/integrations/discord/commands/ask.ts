/**
 * bot/commands/ask.ts — /ask
 *
 * Public. Calls the backend /api/ask-ai endpoint and
 * replies with the answer (and the matching FAQ sources).
 *
 * v1.69 — Phase 6+ per-guild → batchId routing. The
 * (config, batchId) tuple lets each per-program bot hit
 * the right program's data.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { BotConfig } from '../discordBot.js';
import { buildBotApiUrl, botApiHeaders } from '../events/botApi.js';

export const askCommandData = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask Yaksha a question and get an AI-generated answer from the FAQs.')
  .addStringOption((o) => o.setName('question').setDescription('What do you want to ask?').setRequired(true))
  .toJSON();

function errorEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xff6b6b).setTitle('Error').setDescription(msg.slice(0, 3500));
}

export async function executeAsk(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
  batchId: string | null = null
): Promise<void> {
  const question = interaction.options.getString('question', true);
  // Don't make Discord wait longer than ~10s. We set ephemeral
  // early so the user sees a "thinking" state.
  await interaction.deferReply({ ephemeral: true });

  let answer = '(no answer)';
  let sources: { title: string; source: string }[] = [];
  try {
    const res = await fetch(buildBotApiUrl(config, '/csfaq/api/ask-ai', batchId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...botApiHeaders(config, batchId) },
      body: JSON.stringify({ query: question, topK: 3 }),
    });
    if (res.ok) {
      const data = await res.json() as { answer?: string; sources?: { title: string; source: string }[] };
      answer = (data.answer ?? '').trim() || '(no answer)';
      sources = data.sources ?? [];
    } else {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    await interaction.followUp({
      embeds: [errorEmbed(`/ask failed: ${(err as Error).message}`)],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Yaksha says:')
    .setDescription(answer.slice(0, 3500))
    .setFooter({ text: `Q: ${question.slice(0, 80)}${question.length > 80 ? '…' : ''}` })
    .setTimestamp(new Date());
  if (sources.length > 0) {
    embed.addFields({
      name: 'Sources',
      value: sources
        .map((s) => `• ${s.title}`)
        .join('\n')
        .slice(0, 1024),
    });
  }
  await interaction.followUp({ embeds: [embed] });
}

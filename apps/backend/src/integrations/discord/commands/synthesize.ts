import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../events/interactionCreate.js';
import { logger } from '../../../utils/http/logger.js';
import type { BotConfig } from '../discordBot.js';
import { buildBotApiUrl, botApiHeaders } from '../events/botApi.js';

export const synthesizeCommandData = new SlashCommandBuilder()
  .setName('synthesize')
  .setDescription('[admin] Synthesize channel chat history into a Draft FAQ')
  .addIntegerOption((o) =>
    o.setName('limit')
      .setDescription('Number of messages to analyze (default: 30, max: 100)')
      .setRequired(false)
      .setMinValue(5)
      .setMaxValue(100)
  )
  .toJSON();

function errorEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('Error')
    .setDescription(msg.slice(0, 1000));
}

export async function executeSynthesize(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
  batchId: string | null = null
): Promise<void> {
  if (!isAdmin(interaction, config)) {
    await interaction.reply({ content: '🔒 admin only', ephemeral: true });
    return;
  }
  if (!config.internalApiKey) {
    await interaction.reply({ embeds: [errorEmbed('INTERNAL_API_KEY not set')], ephemeral: true });
    return;
  }
  if (!interaction.channel) {
    await interaction.reply({ content: 'Must be run in a channel', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const limit = interaction.options.getInteger('limit') ?? 30;

  try {
    const messages = await interaction.channel.messages.fetch({ limit });
    const transcript = messages
      .reverse()
      .map((m) => `${m.author.username}: ${m.content}`)
      .join('\n');

    const res = await fetch(
      buildBotApiUrl(config, '/csfaq/api/faq/synthesize', batchId),
      {
        method: 'POST',
        headers: {
          'X-Internal-Api-Key': config.internalApiKey ?? '',
          'Content-Type': 'application/json',
          ...botApiHeaders(config, batchId)
        },
        body: JSON.stringify({ transcript, batchId }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as { faq: { question: string; answer: string; category: string; _id: string } };

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('FAQ Synthesized Successfully!')
      .setDescription('A pending Draft FAQ has been added to your dashboard.')
      .addFields(
        { name: 'Category', value: data.faq.category },
        { name: 'Question', value: data.faq.question.slice(0, 250) },
        { name: 'Answer Draft', value: data.faq.answer.slice(0, 500) },
        { name: 'Review Link', value: `${config.publicUrl}/admin/reviews` }
      )
      .setTimestamp(new Date());

    await interaction.followUp({ embeds: [embed] });
  } catch (err) {
    logger.error(`[bot] /synthesize failed: ${(err as Error).message}`);
    await interaction.followUp({ embeds: [errorEmbed(`/synthesize failed: ${(err as Error).message}`)] });
  }
}

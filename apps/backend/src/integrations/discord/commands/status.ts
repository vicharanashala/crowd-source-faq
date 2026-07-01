/**
 * bot/commands/status.ts — /status
 *
 * Public. Renders a server health snapshot as a Discord embed with
 * interactive buttons so users can drill into the data without having
 * to type a slash command (per user request: "GUI based thing which
 * is easier for user on discord you know if you dont do search").
 *
 * v1.69 — Phase 0 (discord capabilities): switched from the
 * admin-only /api/admin/stats (which we never authed correctly) to
 * the public /api/health endpoint that returns a shape tailored to
 * this embed: { faqs, posts, support: { open, pending, resolved,
 * golden }, unanswered, topCategory, searchesToday, serverTime }.
 *
 * v1.69 — Phase 6+ per-guild → batchId routing. The batchId is
 * forwarded so each per-program bot reports its own scope.
 *
 * v1.69 — Phase 4 will wire the action buttons to modals and
 * commands. For now they're all link buttons to the public portal.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { buildBotApiUrl, botApiHeaders } from '../events/botApi.js';
import type { BotConfig } from '../discordBot.js';

export const statusCommandData = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show server health + quick-action buttons (no typing required)')
  .toJSON();

interface HealthResponse {
  faqs?: number;
  posts?: number;
  support?: { open?: number; pending?: number; resolved?: number; golden?: number };
  unanswered?: number;
  topCategory?: string;
  searchesToday?: number;
  serverTime?: string;
}

function errorEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xff6b6b).setTitle('Status failed').setDescription(msg.slice(0, 1000));
}

/** Build the GUI row of buttons that lives below the status embed.
 *  Portal URL is the Yaksha web app, with a /unanswered shortcut. */
function statusActions(portalUrl: string): ActionRowBuilder<ButtonBuilder>[] {
  const portal = portalUrl.replace(/\/+$/, '');
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('🔍 Search the portal')
        .setURL(`${portal}/`),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('❓ Top unanswered')
        .setURL(`${portal}/unresolved`),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('📋 My stats')
        .setURL(`${portal}/profile`),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('🌐 Open Yaksha')
        .setURL(portal),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('🛟 Need help? Open a ticket')
        .setURL(`${portal}/support`),
    ),
  ];
}

export async function executeStatus(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
  batchId: string | null = null
): Promise<void> {
  await interaction.deferReply();

  let data: HealthResponse;
  try {
    const res = await fetch(buildBotApiUrl(config, '/csfaq/api/health', batchId), {
      headers: botApiHeaders(config, batchId),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    data = await res.json() as HealthResponse;
  } catch (err) {
    await interaction.followUp({
      embeds: [errorEmbed(`Couldn't fetch health: ${(err as Error).message}`)],
    });
    return;
  }

  const s = data.support ?? {};
  const color = (s.open ?? 0) > 10 ? 0xffa500 : 0x57f287;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('📊 Yaksha status')
    .addFields(
      { name: '📚 FAQs',         value: `${data.faqs ?? '?'}`,                inline: true },
      { name: '💬 Community',    value: `${data.posts ?? '?'}`,               inline: true },
      { name: '🔎 Searches today', value: `${data.searchesToday ?? '?'}`,     inline: true },
      {
        name: '🛟 Support',
        value: [
          `**open**     ${s.open ?? '?'}`,
          `**pending**  ${s.pending ?? '?'}`,
          `**resolved** ${s.resolved ?? '?'}`,
          `**🏆 golden** ${s.golden ?? '?'}`,
        ].join('  ·  '),
        inline: false,
      },
      { name: '❓ Unanswered',  value: `${data.unanswered ?? '?'} pending FAQ(s)`, inline: true },
      { name: '🏷️ Top category', value: `\`${data.topCategory ?? 'N/A'}\``,    inline: true },
    )
    .setFooter({ text: 'Tap a button below to drill in — no slash command needed.' })
    .setTimestamp(data.serverTime ? new Date(data.serverTime) : new Date());

  await interaction.followUp({
    embeds: [embed],
    components: statusActions(config.publicUrl),
  });
}

/**
 * bot/notifications.ts — post app events to the configured
 * Discord notification channel.
 *
 * Called by the backend controllers when important
 * things happen:
 *   - New support ticket created
 *   - Support ticket resolved (also posted by /resolve)
 *   - Golden ticket converted
 *   - User banned (also posted by /ban)
 *
 * Gated on DISCORD_BOT_TOKEN + DISCORD_NOTIFICATION_CHANNEL_ID.
 * No-ops if the bot is disabled or no channel is set.
 */

import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/http/logger.js';
import { getDiscordClient } from './discordBot.js';

export type NotificationKind =
  | 'new_support_ticket'
  | 'support_ticket_resolved'
  | 'golden_ticket_converted'
  | 'user_banned'
  | 'moderation_action'
  | 'reputation_milestone';

export interface NotificationPayload {
  kind: NotificationKind;
  title: string;
  description: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  color?: number;
  url?: string;
  mentionAdmins?: boolean;
}

const COLOR_BY_KIND: Record<NotificationKind, number> = {
  new_support_ticket:     0xffa500,
  support_ticket_resolved: 0x57f287,
  golden_ticket_converted: 0xfee75c,
  user_banned:            0xed4245,
  moderation_action:      0xed4245,
  reputation_milestone:   0x5865f2,
};

/** Best-effort post. Never throws — callers don't need to wrap. */
export async function postNotification(payload: NotificationPayload): Promise<void> {
  const client = getDiscordClient();
  if (!client) return;
  const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL_ID?.trim();
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) return;
    const embed = new EmbedBuilder()
      .setColor(payload.color ?? COLOR_BY_KIND[payload.kind] ?? 0x5865f2)
      .setTitle(payload.title)
      .setDescription(payload.description.slice(0, 3500))
      .setTimestamp(new Date());
    if (payload.fields) {
      for (const f of payload.fields.slice(0, 8)) {
        embed.addFields({ name: f.name, value: f.value.slice(0, 1024), inline: f.inline });
      }
    }
    if (payload.url) embed.setURL(payload.url);
    const content = payload.mentionAdmins ? '@here' : undefined;
    await channel.send({ content, embeds: [embed] });
  } catch (err) {
    logger.error(`[bot] notification post failed (${payload.kind}): ${(err as Error).message}`);
  }
}

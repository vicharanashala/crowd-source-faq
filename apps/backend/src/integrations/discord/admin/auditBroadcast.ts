/**
 * auditBroadcast.ts — post admin config changes to a Discord channel.
 *
 * The same audit log is appended to MongoDB by the admin.config.service
 * (always). This module additionally posts a sanitised summary to a
 * configured #admin-audit-log channel in Discord, so non-technical
 * team members can see "yashh updated jwt.secret at 18:45 UTC" without
 * needing DB access.
 *
 * The channel is configured via ADMIN_DISCORD_LOG_CHANNEL env var. When
 * unset, the broadcaster is a no-op (production may want all admin
 * activity in Mongo only).
 *
 * Sensitive values (the value field) are NEVER posted — only the key
 * name, the action (set/delete), the admin username, and the source
 * (rest / discord / cli). Critical keys are explicitly tagged.
 */
import { TextChannel } from 'discord.js';
import { getDiscordClient } from '../discordBot.js';
import { adminLog } from '../../../utils/http/logger.js';

interface AuditEvent {
  action: 'config.set' | 'config.delete' | 'session.lockout' | 'session.start';
  key: string | null;
  adminUsername: string;
  adminId: string;
  source: 'rest' | 'discord' | 'cli';
  wasCritical: boolean;
  success: boolean;
  note: string;
  /** Optional pre-rendered message; when set, takes precedence. */
  message?: string;
}

function formatAuditMessage(event: AuditEvent): string {
  const statusEmoji = event.success ? '✅' : '❌';
  const criticalEmoji = event.wasCritical ? '🔒' : '📝';
  const actionLabel = event.action === 'config.set' ? 'updated'
    : event.action === 'config.delete' ? 'removed'
    : event.action === 'session.lockout' ? 'locked out'
    : 'authenticated';

  const parts = [
    `${statusEmoji} **${event.adminUsername}** ${actionLabel}`,
    event.key ? `\`${event.key}\`` : null,
    criticalEmoji,
    event.note ? `_(${event.note})_` : null,
  ].filter(Boolean);

  return parts.join(' ');
}

export async function broadcastAuditEvent(event: AuditEvent): Promise<void> {
  const channelId = process.env.ADMIN_DISCORD_LOG_CHANNEL?.trim();
  if (!channelId) {
    // No channel configured — silently no-op. Most production installs
    // will want this set; local dev / CI may not.
    return;
  }

  const client = getDiscordClient();
  if (!client) {
    adminLog.warn('[admin.audit] broadcast skipped — bot not running');
    return;
  }

  let channel: TextChannel | null = null;
  try {
    channel = (await client.channels.fetch(channelId)) as TextChannel | null;
  } catch (err) {
    adminLog.warn(`[admin.audit] failed to fetch log channel ${channelId}: ${(err as Error).message}`);
    return;
  }
  if (!channel || !('send' in channel)) {
    adminLog.warn(`[admin.audit] channel ${channelId} is not a text channel`);
    return;
  }

  try {
    await channel.send({
      content: event.message ?? formatAuditMessage(event),
      // Disallow @everyone / @here pings in the audit channel
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    adminLog.error(`[admin.audit] broadcast failed: ${(err as Error).message}`);
  }
}
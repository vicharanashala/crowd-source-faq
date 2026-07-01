/**
 * commands/health.ts — /health
 *
 * Gated to configured Admins. Displays detailed server diagnostics,
 * system performance metrics, memory, uptime, and configuration states.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import type { BotConfig } from '../discordBot.js';
import { isAdmin } from '../events/interactionCreate.js';
import { runAllDiagnostics, type DiagnosticResult } from '../admin/diagnostics.js';
import { loadConfig } from '../../../config/loader.js';
import { adminLog } from '../../../utils/http/logger.js';

export const healthCommandData = new SlashCommandBuilder()
  .setName('health')
  .setDescription('Show full server health, diagnostics, and environment metrics (Admins only)')
  .toJSON();

/** Formats duration in seconds into a human-readable string */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

/** Formats bytes to MB string */
function toMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Safely masks password credentials from Redis URLs */
function maskUrl(urlString: string | undefined): string {
  if (!urlString || urlString === '#') return 'Not Configured';
  try {
    const parsed = new URL(urlString);
    if (parsed.password) {
      parsed.password = '*****';
    }
    return parsed.toString();
  } catch {
    return urlString.replace(/:([^:@]+)@/, ':*****@');
  }
}

/** Returns status emoji based on status code */
function diagnosticEmoji(status: 'ok' | 'warn' | 'fail'): string {
  if (status === 'ok') return '🟢';
  if (status === 'warn') return '🟡';
  return '🔴';
}

export async function executeHealth(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
  batchId: string | null = null
): Promise<void> {
  // Gate execution to configured admins only
  if (!isAdmin(interaction, config)) {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Access Denied')
        .setDescription('This command is restricted to configured admins.')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Run diagnostics
    const diagnostics = await runAllDiagnostics();
    const diagLines = diagnostics.map((r) => {
      const latencyStr = r.latencyMs !== undefined ? ` _(${r.latencyMs}ms)_` : '';
      return `${diagnosticEmoji(r.status)} **${r.name}**: ${r.detail}${latencyStr}`;
    });

    const allOk = diagnostics.every((r) => r.status === 'ok');

    // System stats
    const uptime = formatDuration(process.uptime());
    const mem = process.memoryUsage();
    const platform = `${process.platform}-${process.arch}`;
    const nodeVersion = process.version;

    // Config stats
    const appConfig = loadConfig();
    const maskedRedisUrl = maskUrl(appConfig.redis.url);
    const maskedRedisTcpUrl = maskUrl(appConfig.redis.tcpUrl);

    const embed = new EmbedBuilder()
      .setColor(allOk ? 0x4a7c59 : 0xf4a261)
      .setTitle('🩺 System & Server Health Status')
      .setDescription('Detailed real-time diagnostics of the Yaksha server.')
      .addFields(
        {
          name: '📡 System Metrics',
          value: [
            `**Uptime**: \`${uptime}\``,
            `**Platform**: \`${platform}\``,
            `**Node Version**: \`${nodeVersion}\``,
          ].join('\n'),
          inline: false,
        },
        {
          name: '🧠 Process Memory Usage',
          value: [
            `**RSS**: \`${toMb(mem.rss)}\``,
            `**Heap Total**: \`${toMb(mem.heapTotal)}\``,
            `**Heap Used**: \`${toMb(mem.heapUsed)}\``,
            `**External**: \`${toMb(mem.external)}\``,
          ].join('\n'),
          inline: false,
        },
        {
          name: '🔗 Active Configurations (Masked)',
          value: [
            `**Redis URL**: \`${maskedRedisUrl}\``,
            `**Redis TCP URL**: \`${maskedRedisTcpUrl}\``,
          ].join('\n'),
          inline: false,
        },
        {
          name: '🩺 Base Diagnostics',
          value: diagLines.join('\n') || 'No diagnostics ran.',
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: `Requested by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
    adminLog.info(`[admin] /health executed by ${interaction.user.id} (${interaction.user.username}) batchId=${batchId ?? 'global'}`);

  } catch (err) {
    adminLog.error(`[admin] /health command failed: ${(err as Error).message}`);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Diagnostics Failed')
        .setDescription(`An error occurred while compiling server metrics: \`${(err as Error).message}\``)],
    });
  }
}

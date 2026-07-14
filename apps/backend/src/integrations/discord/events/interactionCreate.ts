/**
 * events/interactionCreate.ts — single dispatch point for
 * all slash commands + admin panel component interactions.
 *
 * Slash commands route through the per-command execute* files
 * under ./commands/. Admin panel buttons + modals route through
 * ./adminHandlers.ts.
 */
import { Interaction, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../../utils/http/logger.js';
import type { BotConfig } from '../discordBot.js';
import { executeAsk } from '../commands/ask.js';
import { executeSearch } from '../commands/search.js';
import { executeStatus } from '../commands/status.js';
import { executeHelp } from '../commands/help.js';
import { executeTickets } from '../commands/tickets.js';
import { executeResolve } from '../commands/resolve.js';
import { executeBan } from '../commands/ban.js';
import { executeBroadcast } from '../commands/broadcast.js';
import { executeAdmin } from '../commands/admin.js';
import { executeCrud } from '../commands/crud.js';
import { executeHealth } from '../commands/health.js';
import { executeSetupAdmin } from '../commands/setupadmin.js';
import { executeSynthesize } from '../commands/synthesize.js';
import {
  handleUnlockButton,
  handlePassphraseModal,
  handleDiagnosticsButton,
  handleViewButton,
  handleSetButton,
  handleSetValueModal,
  handleAuditButton,
  handleLockButton,
} from './adminHandlers.js';

export interface BotRuntimeContext {
  config: BotConfig;
  batchId: string | null;
}

export async function handleInteraction(
  interaction: Interaction,
  ctx: BotConfig | BotRuntimeContext
): Promise<void> {
  const runtime: BotRuntimeContext = 'config' in ctx
    ? ctx
    : { config: ctx as BotConfig, batchId: null };

  // Slash commands
  if (interaction.isChatInputCommand()) {
    const cmd = interaction as ChatInputCommandInteraction;
    try {
      switch (cmd.commandName) {
        case 'ask':       return await executeAsk(cmd, runtime.config, runtime.batchId);
        case 'search':    return await executeSearch(cmd, runtime.config, runtime.batchId);
        case 'status':    return await executeStatus(cmd, runtime.config, runtime.batchId);
        case 'help':      return await executeHelp(cmd, runtime.config, runtime.batchId);
        case 'tickets':   return await executeTickets(cmd, runtime.config, runtime.batchId);
        case 'resolve':   return await executeResolve(cmd, runtime.config, runtime.batchId);
        case 'ban':       return await executeBan(cmd, runtime.config, runtime.batchId);
        case 'broadcast': return await executeBroadcast(cmd, runtime.config, runtime.batchId);
        case 'admin':     return await executeAdmin(cmd, runtime.config, runtime.batchId);
        case 'crud':      return await executeCrud(cmd, runtime.config, runtime.batchId);
        case 'health':    return await executeHealth(cmd, runtime.config, runtime.batchId);
        case 'setupadmin': return await executeSetupAdmin(cmd, runtime.config, runtime.batchId);
        case 'synthesize': return await executeSynthesize(cmd, runtime.config, runtime.batchId);
        default:
          await cmd.reply({
            embeds: [new EmbedBuilder()
              .setColor(0xff6b6b)
              .setTitle('Unknown command')
              .setDescription(`\`/${cmd.commandName}\` isn't registered. Try \`/help\`.`)],
            ephemeral: true,
          });
      }
    } catch (err) {
      logger.error(`[bot] /${cmd.commandName} threw: ${(err as Error).message}`);
      try {
        const msg = `Something went wrong: \`${(err as Error).message}\``;
        if (cmd.deferred || cmd.replied) {
          await cmd.followUp({ content: msg, ephemeral: true });
        } else {
          await cmd.reply({ content: msg, ephemeral: true });
        }
      } catch {
        // give up
      }
    }
    return;
  }

  // Component / modal interactions (admin panel)
  if (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) {
    try {
      const id = interaction.customId;
      if (id === 'admin:unlock' && interaction.isButton()) {
        return await handleUnlockButton(interaction);
      }
      if (id === 'admin:passphrase' && interaction.isModalSubmit()) {
        return await handlePassphraseModal(interaction);
      }
      if (id === 'admin:diagnostics' && interaction.isButton()) {
        return await handleDiagnosticsButton(interaction);
      }
      if (id === 'admin:view' && interaction.isButton()) {
        return await handleViewButton(interaction);
      }
      if (id === 'admin:audit' && interaction.isButton()) {
        return await handleAuditButton(interaction);
      }
      if (id === 'admin:set' && interaction.isButton()) {
        return await handleSetButton(interaction);
      }
      if (id === 'admin:set:value' && interaction.isModalSubmit()) {
        return await handleSetValueModal(interaction);
      }
      if (id === 'admin:lock' && interaction.isButton()) {
        return await handleLockButton(interaction);
      }
    } catch (err) {
      logger.error(`[bot] admin component interaction threw: ${(err as Error).message}`);
      try {
        const msg = `Something went wrong: \`${(err as Error).message}\``;
        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: msg, ephemeral: true });
          } else {
            await interaction.reply({ content: msg, ephemeral: true });
          }
        }
      } catch {
        // give up
      }
    }
    return;
  }
}

export function isAdmin(interaction: ChatInputCommandInteraction, ctx: BotConfig | BotRuntimeContext): boolean {
  const config = 'config' in ctx ? ctx.config : ctx;
  if (config.adminUserIds.length === 0) return false;
  return config.adminUserIds.includes(interaction.user.id);
}
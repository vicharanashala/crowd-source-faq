/**
 * bot/events/interactionCreate.ts — single dispatch point for
 * all slash commands. The dispatcher is intentionally tiny:
 * the heavy lifting is in the per-command execute* files
 * under ./commands/.
 *
 * v1.69 — Phase 6+ per-guild → batchId routing: every
 * per-program bot is keyed by batchId in BotManager. The
 * runtime context passed to each command carries the
 * batchId so the command can call the backend with
 * `?batchId=...` and hit the right program's data.
 */
import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/http/logger.js';
import { executeAsk } from '../commands/ask.js';
import { executeSearch } from '../commands/search.js';
import { executeStatus } from '../commands/status.js';
import { executeHelp } from '../commands/help.js';
import { executeTickets } from '../commands/tickets.js';
import { executeResolve } from '../commands/resolve.js';
import { executeBan } from '../commands/ban.js';
import { executeBroadcast } from '../commands/broadcast.js';
export async function handleInteraction(interaction, ctx) {
    // v1.69 — Additive signature: legacy callers pass a
    // bare BotConfig, new callers (botManager) pass a
    // BotRuntimeContext with the batchId. Detect the shape
    // and normalise.
    const runtime = 'config' in ctx
        ? ctx
        : { config: ctx, batchId: null };
    // We only handle ChatInputCommand (slash) interactions. Other
    // interaction types (autocomplete, modal submit, button
    // click) aren't used yet.
    if (!interaction.isChatInputCommand())
        return;
    const cmd = interaction;
    try {
        switch (cmd.commandName) {
            case 'ask': return await executeAsk(cmd, runtime.config, runtime.batchId);
            case 'search': return await executeSearch(cmd, runtime.config, runtime.batchId);
            case 'status': return await executeStatus(cmd, runtime.config, runtime.batchId);
            case 'help': return await executeHelp(cmd, runtime.config, runtime.batchId);
            case 'tickets': return await executeTickets(cmd, runtime.config, runtime.batchId);
            case 'resolve': return await executeResolve(cmd, runtime.config, runtime.batchId);
            case 'ban': return await executeBan(cmd, runtime.config, runtime.batchId);
            case 'broadcast': return await executeBroadcast(cmd, runtime.config, runtime.batchId);
            default:
                await cmd.reply({
                    embeds: [new EmbedBuilder()
                            .setColor(0xff6b6b)
                            .setTitle('Unknown command')
                            .setDescription(`\`/${cmd.commandName}\` isn't registered. Try \`/help\`.`)],
                    ephemeral: true,
                });
        }
    }
    catch (err) {
        logger.error(`[bot] /${cmd.commandName} threw: ${err.message}`);
        // Best-effort error reply (the interaction may have been
        // already-replied-to or deferred; the discord.js lib
        // throws specific errors in that case which we swallow).
        try {
            const msg = `Something went wrong: \`${err.message}\``;
            if (cmd.deferred || cmd.replied) {
                await cmd.followUp({ content: msg, ephemeral: true });
            }
            else {
                await cmd.reply({ content: msg, ephemeral: true });
            }
        }
        catch {
            // give up
        }
    }
}
export function isAdmin(interaction, ctx) {
    const config = 'config' in ctx ? ctx.config : ctx;
    if (config.adminUserIds.length === 0)
        return false;
    return config.adminUserIds.includes(interaction.user.id);
}

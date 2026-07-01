/**
 * bot/registerCommands.ts — register slash commands with
 * the Discord API. Called on bot ready (guild-scoped for
 * instant updates) and from a CLI script (global for prod).
 */
import { REST, Routes } from 'discord.js';
import { logger } from '../utils/http/logger.js';
import { askCommandData, executeAsk } from './commands/ask.js';
import { searchCommandData, executeSearch } from './commands/search.js';
import { statusCommandData, executeStatus } from './commands/status.js';
import { helpCommandData, executeHelp } from './commands/help.js';
import { ticketsCommandData, executeTickets } from './commands/tickets.js';
import { resolveCommandData, executeResolve } from './commands/resolve.js';
import { banCommandData, executeBan } from './commands/ban.js';
import { broadcastCommandData, executeBroadcast } from './commands/broadcast.js';
function buildCommandList() {
    return [
        askCommandData,
        searchCommandData,
        statusCommandData,
        helpCommandData,
        ticketsCommandData,
        resolveCommandData,
        banCommandData,
        broadcastCommandData,
    ];
}
export async function registerCommands(config) {
    const rest = new REST({ version: '10' }).setToken(config.botToken);
    const body = buildCommandList();
    const route = config.scope === 'guild'
        ? Routes.applicationGuildCommands(config.clientId, config.guildId)
        : Routes.applicationCommands(config.clientId);
    await rest.put(route, { body });
    logger.info(`[bot] registered ${body.length} ${config.scope} commands`);
}
// Re-export so the CLI script (scripts/registerDiscordCommands.ts)
// and the bot have one source of truth.
export { askCommandData, searchCommandData, statusCommandData, helpCommandData, ticketsCommandData, resolveCommandData, banCommandData, broadcastCommandData };
export { executeAsk, executeSearch, executeStatus, executeHelp, executeTickets, executeResolve, executeBan, executeBroadcast };

/**
 * bot/discordBot.ts — main Discord bot client.
 *
 * Same-process as the backend. Started from server.ts
 * after mongoose.connect. Gated on DISCORD_BOT_TOKEN —
 * if the env var is missing, the bot skips startup with
 * a single log line (not a crash) so the rest of the
 * app keeps running.
 *
 * Public slash commands:
 *   /ask <question>     → /api/ask-ai
 *   /search <query>     → /api/search
 *   /status             → server health snapshot
 *   /help               → list of available commands
 *
 * Admin slash commands (gated on DISCORD_ADMIN_USER_IDS):
 *   /tickets [status]   → list support tickets
 *   /resolve <id> <note>→ mark a support ticket resolved
 *   /ban <user_id> <reason> → ban a user
 *   /broadcast <message>→ post a message to the configured
 *                          notification channel
 *
 * Notifications (auto-posted to DISCORD_NOTIFICATION_CHANNEL_ID):
 *   - New support ticket created
 *   - Support ticket resolved
 *   - Golden ticket converted
 *   - User banned
 *
 * Env vars expected in backend/.env.local:
 *   DISCORD_BOT_TOKEN                  — bot token (required to start)
 *   DISCORD_CLIENT_ID                  — application ID (required to register)
 *   DISCORD_GUILD_ID                   — guild (server) for instant cmd register
 *   DISCORD_ADMIN_USER_IDS             — comma-separated Discord user IDs
 *   DISCORD_NOTIFICATION_CHANNEL_ID    — channel for notifications
 *   DISCORD_PUBLIC_CHANNEL_ID          — channel for user-facing announcements
 *   PUBLIC_URL                         — backend URL the bot calls (defaults http://localhost:6767)
 *   INTERNAL_API_KEY                   — shared secret bot uses for admin-only endpoints
 */
import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';
import { registerCommands } from './registerCommands.js';
import { handleInteraction } from './events/interactionCreate.js';
import { logger } from '../utils/http/logger.js';
let client = null;
export function getDiscordClient() {
    return client;
}
/** Parse env vars. Returns null if any required one is missing. */
export function loadBotConfig() {
    const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
    const clientId = process.env.DISCORD_CLIENT_ID?.trim();
    const guildId = process.env.DISCORD_GUILD_ID?.trim();
    if (!botToken || !clientId || !guildId) {
        return null;
    }
    const adminUserIds = (process.env.DISCORD_ADMIN_USER_IDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return {
        botToken,
        clientId,
        guildId,
        adminUserIds,
        notificationChannelId: process.env.DISCORD_NOTIFICATION_CHANNEL_ID?.trim() || null,
        publicChannelId: process.env.DISCORD_PUBLIC_CHANNEL_ID?.trim() || null,
        publicUrl: (process.env.PUBLIC_URL ?? process.env.CLIENT_URL ?? 'http://localhost:6767').trim().replace(/\/+$/, ''),
        internalApiKey: process.env.INTERNAL_API_KEY?.trim() || null,
    };
}
/** Boot the bot. Returns the client (or null if not configured). */
export async function startBot() {
    const config = loadBotConfig();
    if (!config) {
        logger.info('[bot] DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID not set — bot disabled. (This is fine in dev.)');
        return null;
    }
    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            // We don't need MessageContent for slash commands, but
            // GatewayIntentBits.Guilds is required for slash command
            // delivery.
        ],
        // We don't use message content for any prefix commands
        // (everything is slash), so leave the privileged intent off.
        partials: [Partials.Channel],
    });
    // Register the slash commands on the guild the bot is in.
    // Guild-scoped register is instant; global register takes
    // ~1 hour. We use guild for dev, expose registerGlobal()
    // for production.
    client.once(Events.ClientReady, async (c) => {
        logger.info(`[bot] Discord client ready — logged in as ${c.user.tag} (id ${c.user.id})`);
        logger.info(`[bot] serving guild ${config.guildId}`);
        try {
            await registerCommands({ ...config, scope: 'guild' });
            logger.info('[bot] guild slash commands registered (instant)');
        }
        catch (err) {
            logger.error(`[bot] failed to register guild commands: ${err.message}`);
        }
    });
    client.on(Events.InteractionCreate, (interaction) => {
        // The handler is async but we don't await — discord.js
        // doesn't need the Promise back.
        void handleInteraction(interaction, config);
    });
    client.on(Events.Error, (err) => {
        logger.error(`[bot] client error: ${err.message}`);
    });
    try {
        await client.login(config.botToken);
        return client;
    }
    catch (err) {
        logger.error(`[bot] login failed: ${err.message}`);
        client = null;
        return null;
    }
}
/** Stop the bot on server shutdown. */
export async function stopBot() {
    if (!client)
        return;
    try {
        await client.destroy();
        logger.info('[bot] client destroyed');
    }
    catch (err) {
        logger.error(`[bot] error during destroy: ${err.message}`);
    }
    finally {
        client = null;
    }
}

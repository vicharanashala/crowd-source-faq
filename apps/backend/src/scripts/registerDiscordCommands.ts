/**
 * registerDiscordCommands.ts — register slash commands
 * globally (or per-guild) for the Discord bot.
 *
 * One-shot script. Use:
 *   npm run bot:register:global    → register globally (1 hr to propagate)
 *   npm run bot:register:guild     → register per-guild (instant, dev only)
 *
 * Reads env vars from backend/.env.local:
 *   DISCORD_BOT_TOKEN
 *   DISCORD_CLIENT_ID
 *   DISCORD_GUILD_ID
 */

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { loadBotConfig } from '../integrations/discord/discordBot.js';
import { registerCommands } from '../integrations/discord/registerCommands.js';
import { logger } from '../utils/http/logger.js';

async function main(): Promise<void> {
  const config = loadBotConfig();
  if (!config) {
    console.error('DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID must be set in backend/.env.local');
    process.exit(1);
  }
  const scope = (process.argv[2] === 'guild' ? 'guild' : 'global') as 'guild' | 'global';
  if (scope === 'global') {
    console.log('Registering GLOBALLY (1-hour propagation to all servers). Use "guild" arg for instant dev register.');
  } else {
    console.log(`Registering for guild ${config.guildId} (instant).`);
  }
  try {
    await registerCommands({ ...config, scope });
    console.log(`✅ ${scope} commands registered. Run /help in your Discord server to verify.`);
  } catch (err) {
    console.error(`❌ register failed: ${(err as Error).message}`);
    logger.error(`[bot-cli] register failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });

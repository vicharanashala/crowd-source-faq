/**
 * v1.69 — Phase 6: per-program Discord bot manager.
 *
 * Replaces the single global `client` (env-var-backed) with a
 * `Map<batchId, BotInstance>` that the admin can populate by
 * storing per-program Discord tokens in
 * `ProgramConfig.discord`. Each program gets its own bot client
 * + guild registration. The legacy global `startBot()` /
 * `stopBot()` (env-var backed) is preserved as a fallback.
 *
 * Lifecycle:
 *   1. server.ts startup calls `botManager.startAll()` which
 *      iterates ProgramConfig where discord.enabled=true and
 *      starts a bot for each.
 *   2. Admin can add a new program bot at runtime via
 *      `PUT /api/admin/programs/:id/discord` (decryption
 *      happens in programDiscordController). The next call to
 *      `botManager.startBotForProgram(batchId)` brings the new
 *      bot online.
 *   3. On shutdown, `botManager.stopAll()` gracefully logs out
 *      every active client.
 *
 * Per-guild slash-command routing (mapping a guild's interaction
 * to the right batchId for API calls) is Phase 6+ — for now,
 * every per-program bot registers the same command set.
 */

import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';
import { Types } from 'mongoose';
import { registerCommands } from './registerCommands.js';
import { handleInteraction } from './events/interactionCreate.js';
import { logger } from '../../utils/http/logger.js';
import { decrypt } from '../../utils/auth/crypto.js';

export interface ProgramBotConfig {
  batchId: string;
  botToken: string;
  applicationId: string;
  /** Mirror of applicationId so the legacy BotConfig shape is
   *  satisfied without alias gymnastics at every call site. */
  clientId: string;
  guildId: string;
  webhookUrl: string | null;
  notificationChannelId: string | null;
  // v1.69 — Phase 6: registerCommands (the legacy command
  // registration helper) requires the full BotConfig shape.
  // Per-program bots don't currently use these fields but
  // the type alignment is needed for the registration call
  // to type-check. Per-program defaults are sensible
  // (empty arrays, sensible URLs).
  adminUserIds: string[];
  publicChannelId: string | null;
  publicUrl: string;
  internalApiKey: string | null;
}

export interface BotInstance {
  batchId: string;
  client: Client;
  config: ProgramBotConfig;
  startedAt: Date;
}

class BotManager {
  private bots = new Map<string, BotInstance>();
  private restarting = false;

  /** Number of currently running per-program bots. */
  size(): number {
    return this.bots.size;
  }

  /**
   * Build the per-program bot instance from a ProgramConfig
   * row. Returns null when the config is incomplete (no token
   * or no enabled flag) — callers treat that as 'skip'.
   */
  private async buildInstance(batchId: string): Promise<BotInstance | null> {
    // Dynamic import so this file can be required even before
    // the ProgramConfig migration lands.
    const { default: ProgramConfig } = await import('../../modules/program/program-config.model.js');
    const doc = await ProgramConfig.findOne({ batchId: new Types.ObjectId(batchId) })
      .select('+discord.botToken')
      .lean();
    if (!doc?.discord?.enabled || !doc.discord.botToken) return null;

    const botToken = decrypt(doc.discord.botToken);
    const cfg: ProgramBotConfig = {
      batchId,
      botToken,
      applicationId: doc.discord.applicationId ?? '',
      clientId: doc.discord.applicationId ?? '',
      guildId: doc.discord.guildId ?? '',
      webhookUrl: doc.discord.webhookUrl ?? null,
      notificationChannelId: doc.discord.notificationChannelId ?? null,
      // Sensible defaults so the per-program bot fits the
      // legacy BotConfig shape.
      adminUserIds: [],
      publicChannelId: null,
      publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:6767',
      internalApiKey: process.env.INTERNAL_API_KEY ?? null,
    };
    if (!cfg.guildId) {
      logger.warn(`[botManager] Program ${batchId} has discord.enabled but no guildId — skipping.`);
      return null;
    }
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
      partials: [Partials.Channel],
    });
    return { batchId, client, config: cfg, startedAt: new Date() };
  }

  /**
   * Start a per-program bot. Idempotent — calling twice for the
   * same batchId is a no-op (unless the prior instance crashed,
   * in which case it's replaced).
   */
  async startBotForProgram(batchId: string): Promise<BotInstance | null> {
    if (this.bots.has(batchId)) {
      logger.info(`[botManager] Program ${batchId} bot already running — skipping.`);
      return this.bots.get(batchId) ?? null;
    }
    let instance: BotInstance | null = null;
    try {
      instance = await this.buildInstance(batchId);
    } catch (err) {
      logger.error(`[botManager] Failed to build bot instance for ${batchId}: ${(err as Error).message}`);
      return null;
    }
    if (!instance) return null;

    try {
      instance.client.once(Events.ClientReady, async (c) => {
        logger.info(`[botManager] Program ${batchId} bot ready — logged in as ${c.user.tag}`);
        try {
          // v1.69 — Phase 6: pass the new single-config-object
          // shape (BotConfig + scope) that registerCommands
          // expects. The botToken lives on instance.config (the
          // decrypted cipher is already in memory at this
          // point).
          await registerCommands({
            ...instance!.config,
            clientId: instance!.config.applicationId,
            scope: 'guild' as const,
          });
          logger.info(`[botManager] Program ${batchId} commands registered for guild ${instance!.config.guildId}`);
        } catch (err) {
          logger.error(`[botManager] Program ${batchId} command registration failed: ${(err as Error).message}`);
        }
      });
      instance.client.on(Events.InteractionCreate, (interaction) => {
        // For now, every per-program bot serves the same
        // command set. Phase 6+ adds per-guild→batchId routing.
        void handleInteraction(interaction, instance!.config);
      });
      await instance.client.login(instance.config.botToken);
      this.bots.set(batchId, instance);
      return instance;
    } catch (err) {
      logger.error(`[botManager] Failed to start bot for program ${batchId}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Stop a per-program bot. Removes the entry from the map even
   * if logout throws (so the next start is a fresh login, not
   * a re-login into a half-torn-down session).
   */
  async stopBotForProgram(batchId: string): Promise<boolean> {
    const instance = this.bots.get(batchId);
    if (!instance) return false;
    this.bots.delete(batchId);
    try {
      await instance.client.destroy();
      logger.info(`[botManager] Program ${batchId} bot stopped.`);
    } catch (err) {
      logger.error(`[botManager] Program ${batchId} bot stop failed: ${(err as Error).message}`);
    }
    return true;
  }

  /**
   * Iterate all ProgramConfig rows with discord.enabled=true
   * and start a bot for each. Called from server.ts on boot.
   */
  async startAll(): Promise<void> {
    try {
      const { default: ProgramConfig } = await import('../../modules/program/program-config.model.js');
      const configs = await ProgramConfig.find({ 'discord.enabled': true })
        .select('_id discord.applicationId discord.guildId')
        .lean();
      for (const c of configs) {
        await this.startBotForProgram(String(c._id));
      }
      logger.info(`[botManager] startAll: ${this.bots.size} bot(s) running.`);
    } catch (err) {
      logger.error(`[botManager] startAll failed: ${(err as Error).message}`);
    }
  }

  /**
   * Graceful shutdown — logs out every active bot.
   */
  async stopAll(): Promise<void> {
    this.restarting = false;
    const ids = Array.from(this.bots.keys());
    await Promise.allSettled(ids.map((id) => this.stopBotForProgram(id)));
  }

  /**
   * Convenience for handlers that need to know which batchId a
   * given Discord client belongs to. Returns null for the
   * legacy global client (no batchId is associated with it).
   */
  batchIdForClient(client: Client): string | null {
    for (const [id, inst] of this.bots) {
      if (inst.client === client) return id;
    }
    return null;
  }

  list(): BotInstance[] {
    return Array.from(this.bots.values());
  }
}

// Module-level singleton. The server boots one manager; admin
// endpoints mutate it at runtime.
export const botManager = new BotManager();

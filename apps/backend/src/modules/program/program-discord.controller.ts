/**
 * v1.69 — Phase 6: per-program Discord admin controller.
 *
 * Stores per-program Discord bot config in ProgramConfig.discord
 * (botToken / applicationId / guildId / webhookUrl /
 * notificationChannelId). The runtime BotManager picks these up
 * on its next start cycle.
 *
 * This is the admin's hook into the bot fleet. The admin
 * registers a Discord app for each program at the Discord
 * developer portal, then drops the credentials here.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import ProgramConfig from './program-config.model.js';
import Batch from './batch.model.js';
import { encrypt, decrypt } from '../../utils/auth/crypto.js';
import { botManager } from '../../integrations/discord/botManager.js';
import { httpLog } from '../../utils/http/logger.js';

const upsertBody = z.object({
  applicationId: z.string().min(8).max(50),
  guildId: z.string().min(8).max(50),
  botToken: z.string().min(20).max(200),
  webhookUrl: z.string().url().nullable().optional(),
  notificationChannelId: z.string().min(8).max(50).nullable().optional(),
  enabled: z.boolean().optional().default(true),
});

const batchIdParam = (req: Request): string | null => {
  const raw = req.params.batchId ?? req.params.id;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
};

function asObjectIdOr400(res: Response, raw: string | null): Types.ObjectId | null {
  if (!raw) {
    res.status(400).json({ message: 'batchId is required.' });
    return null;
  }
  if (!Types.ObjectId.isValid(raw)) {
    res.status(400).json({ message: 'Invalid batchId.' });
    return null;
  }
  return new Types.ObjectId(raw);
}

// ─── GET /api/admin/programs/:id/discord ─────────────────────────────────────

export async function getProgramDiscordConfigRoute(req: Request, res: Response): Promise<void> {
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  try {
    const doc = await ProgramConfig.findOne({ batchId: batchId })
      .select('+discord.botToken')
      .lean();
    if (!doc?.discord) {
      res.json({
        connected: false,
        running: botManager.list().some((b) => b.batchId === String(batchId)),
        source: 'env',
        message: 'No per-program Discord config yet. Falling back to env-var global bot (or no bot).',
      });
      return;
    }
    res.json({
      connected: !!doc.discord.enabled,
      running: botManager.list().some((b) => b.batchId === String(batchId)),
      applicationId: doc.discord.applicationId ?? null,
      guildId: doc.discord.guildId ?? null,
      hasBotToken: !!doc.discord.botToken,
      webhookUrl: doc.discord.webhookUrl ?? null,
      notificationChannelId: doc.discord.notificationChannelId ?? null,
      source: 'program',
    });
  } catch (err) {
    httpLog.error(`[programDiscord] get failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load per-program Discord config.' });
  }
}

// ─── PUT /api/admin/programs/:id/discord ─────────────────────────────────────

export async function upsertProgramDiscordConfig(req: Request, res: Response): Promise<void> {
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  const parsed = upsertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  const batch = await Batch.exists({ _id: batchId, isActive: true });
  if (!batch) {
    res.status(404).json({ message: 'Program not found or archived.' });
    return;
  }
  const { applicationId, guildId, botToken, webhookUrl, notificationChannelId, enabled } = parsed.data;
  const botTokenCipher = encrypt(botToken);
  try {
    await ProgramConfig.findOneAndUpdate(
      { batchId },
      {
        $set: {
          'discord.applicationId': applicationId,
          'discord.guildId': guildId,
          'discord.botToken': botTokenCipher,
          'discord.webhookUrl': webhookUrl ?? null,
          'discord.notificationChannelId': notificationChannelId ?? null,
          'discord.enabled': enabled,
        },
        $setOnInsert: { batchId },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // If this program already had a running bot, restart it so
    // the new credentials take effect immediately.
    if (botManager.list().some((b) => b.batchId === String(batchId))) {
      await botManager.stopBotForProgram(String(batchId));
    }
    let runningAfter = false;
    if (enabled) {
      const inst = await botManager.startBotForProgram(String(batchId));
      runningAfter = !!inst;
    }
    res.json({
      ok: true,
      connected: enabled,
      running: runningAfter,
      source: 'program',
    });
  } catch (err) {
    httpLog.error(`[programDiscord] upsert failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to save per-program Discord config.' });
  }
}

// ─── POST /api/admin/programs/:id/discord/disable ───────────────────────────

export async function disableProgramDiscordConfig(req: Request, res: Response): Promise<void> {
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  try {
    await ProgramConfig.findOneAndUpdate(
      { batchId },
      { $set: { 'discord.enabled': false } },
      { new: true }
    );
    await botManager.stopBotForProgram(String(batchId));
    res.json({ ok: true, connected: false, running: false });
  } catch (err) {
    httpLog.error(`[programDiscord] disable failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to disable per-program Discord.' });
  }
}

// ─── POST /api/admin/programs/:id/discord/enable ────────────────────────────

export async function enableProgramDiscordConfig(req: Request, res: Response): Promise<void> {
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  try {
    const doc = await ProgramConfig.findOne({ batchId }).select('discord').lean();
    if (!doc?.discord?.botToken) {
      res.status(400).json({ message: 'No Discord credentials stored for this program. PUT first.' });
      return;
    }
    await ProgramConfig.findOneAndUpdate(
      { batchId },
      { $set: { 'discord.enabled': true } },
      { new: true }
    );
    const inst = await botManager.startBotForProgram(String(batchId));
    res.json({ ok: true, connected: true, running: !!inst });
  } catch (err) {
    httpLog.error(`[programDiscord] enable failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to enable per-program Discord.' });
  }
}

// v1.69 — expose the decrypt helper for tests + ad-hoc admin
// tooling that needs to verify the stored cipher round-trips.
export const _testing = { decrypt };

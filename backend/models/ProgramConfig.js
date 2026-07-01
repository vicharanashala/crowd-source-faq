/**
 * ProgramConfig — v1.69
 *
 * Operational config for a program that was previously scattered
 * across `User` (Zoom OAuth tokens), `AppSetting` (Golden Ticket
 * cooldowns), and env vars. The intent is to let a single global
 * admin run multiple programs each with their own:
 *
 *   - Zoom OAuth connection (client + encrypted access/refresh)
 *   - Discord bot token + guild + webhook
 *   - Per-program app settings (Golden Ticket SP cost, cooldown)
 *
 * 1:1 with `Batch` via `batchId` (unique). The model is
 * intentionally narrow: anything user-facing (theme, hero copy,
 * sections, branding) lives in `ProgramSettings`. This file is
 * the per-program "ops backend" config.
 *
 * Secret fields (`zoom.accessToken`, `zoom.refreshToken`,
 * `zoom.clientSecret`, `discord.botToken`) must be AES-256-GCM
 * encrypted at rest. The encryption helpers live in `utils/crypto.ts`.
 */
import mongoose, { Schema as MongooseSchema } from 'mongoose';
const programConfigSchema = new MongooseSchema({
    // 1:1 with Batch. Unique so two programs can never collide.
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        required: true,
        unique: true,
        index: true,
    },
    zoom: {
        clientId: { type: String, default: null },
        clientSecret: { type: String, default: null },
        redirectUri: { type: String, default: null },
        webhookSecretToken: { type: String, default: null },
        connected: { type: Boolean, default: false },
        accessToken: { type: String, default: null },
        refreshToken: { type: String, default: null },
        tokenExpiry: { type: Date, default: null },
        connectedAt: { type: Date, default: null },
    },
    discord: {
        botToken: { type: String, default: null },
        applicationId: { type: String, default: null },
        guildId: { type: String, default: null },
        // v1.69 — Phase 6: per-program notification channel.
        notificationChannelId: { type: String, default: null },
        webhookUrl: { type: String, default: null },
        enabled: { type: Boolean, default: false },
    },
    appSettings: {
        goldenTicketCooldownHours: { type: Number, default: 48 },
        goldenTicketSpCost: { type: Number, default: 50 },
        penaltyMultiplier: { type: Number, default: 1 },
    },
}, { timestamps: true });
export default mongoose.model('ProgramConfig', programConfigSchema, 'yaksha_program_configs');

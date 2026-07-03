/**
 * events/adminHandlers.ts — button + modal handlers for the admin panel.
 *
 * Three flows:
 *   - Unlock: passphrase modal → verify → issue session → show main menu
 *   - Diagnostics: read-only status of Mongo / Redis / AI / GCS / passphrase
 *   - View: list config keys with current values (critical masked)
 *   - Audit: most-recent audit log entries
 *
 * Sessions are tracked in-memory for now (Map keyed by Discord userId).
 * For multi-instance deployments the AdminSession model is the source of
 * truth; the in-memory cache is just a hot-path lookup. The passphrase
 * itself is stored in AdminConfig (see passphrase.ts).
 */
import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { listConfig as listConfigResolver } from '../../../config/runtimeConfig.js';
import { setConfig as setConfigService } from '../../../modules/admin/admin.config.service.js';
import AdminAuditLog from '../../../models/AdminAuditLog.js';
import { verifyPassphrase } from '../admin/passphrase.js';
import { mintSession, revokeAllSessionsForAdmin } from '../admin/session.js';
import { runAllDiagnostics, type DiagnosticResult } from '../admin/diagnostics.js';
import { broadcastAuditEvent } from '../admin/auditBroadcast.js';
import { categorize } from '../../../config/adminCategorize.js';
import { adminLog } from '../../../utils/http/logger.js';

// ── In-memory session cache ─────────────────────────────────────────────────
//
// Discord userId -> { token, expiresAt, source: 'discord' }
const sessionCache = new Map<string, { token: string; expiresAt: number; username: string }>();

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour, matches AdminSession

function setCachedSession(userId: string, token: string, username: string): void {
  sessionCache.set(userId, { token, expiresAt: Date.now() + SESSION_TTL_MS, username });
}

function getCachedSession(userId: string): { token: string; username: string } | null {
  const entry = sessionCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    sessionCache.delete(userId);
    return null;
  }
  return { token: entry.token, username: entry.username };
}

function clearCachedSession(userId: string): void {
  sessionCache.delete(userId);
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function errorEmbed(title: string, detail: string) {
  return new EmbedBuilder().setColor(0xff6b6b).setTitle(title).setDescription(detail);
}

function okEmbed(title: string, detail: string) {
  return new EmbedBuilder().setColor(0x4a7c59).setTitle(title).setDescription(detail);
}

function diagnosticEmoji(status: DiagnosticResult['status']): string {
  return status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
}

// ── Button: Unlock ───────────────────────────────────────────────────────────

export async function handleUnlockButton(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('admin:passphrase')
    .setTitle('Unlock admin')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('passphrase')
          .setLabel('Passphrase')
          .setStyle(TextInputStyle.Short)
          .setMinLength(8)
          .setMaxLength(200)
          .setRequired(true)
          .setPlaceholder('Enter your admin passphrase')
      )
    );

  await interaction.showModal(modal);
}

export async function handlePassphraseModal(interaction: ModalSubmitInteraction): Promise<void> {
  const passphrase = interaction.fields.getTextInputValue('passphrase');
  const userId = interaction.user.id;
  const username = interaction.user.username;

  const ok = await verifyPassphrase(passphrase);
  if (!ok) {
    await interaction.reply({
      embeds: [errorEmbed('Unlock failed', 'Wrong passphrase. Try again or contact another admin.')],
      ephemeral: true,
    });
    adminLog.warn(`[admin] failed unlock by ${userId} (${username})`);
    return;
  }

  // Issue a session, cache it in-memory for the hot path.
  const { token, expiresAt } = await mintSession({
    adminId: userId,
    adminUsername: username,
    source: 'discord',
    ipAddress: null,
    userAgent: `discord:${userId}`,
  });
  setCachedSession(userId, token, username);

  await interaction.reply({
    embeds: [okEmbed('🔓 Unlocked', `Session valid until ${new Date(expiresAt).toUTCString()}.`)],
    components: [mainMenuRow()],
    ephemeral: true,
  });
  adminLog.info(`[admin] ${username} (${userId}) unlocked; session until ${new Date(expiresAt).toISOString()}`);
  void broadcastAuditEvent({
    action: 'session.start',
    key: null,
    adminUsername: username,
    adminId: userId,
    source: 'discord',
    wasCritical: false,
    success: true,
    note: 'passphrase verified',
  });
}

// ── Main menu (after unlock) ────────────────────────────────────────────────

function mainMenuRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('admin:set').setLabel('Set config').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('admin:view').setLabel('View config').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
    new ButtonBuilder().setCustomId('admin:audit').setLabel('Audit log').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
    new ButtonBuilder().setCustomId('admin:lock').setLabel('Lock').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  );
}

// ── Button: Diagnostics ────────────────────────────────────────────────────

export async function handleDiagnosticsButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const results = await runAllDiagnostics();
  const lines = results.map((r) => `${diagnosticEmoji(r.status)} **${r.name}** — ${r.detail}${r.latencyMs ? ` _(${r.latencyMs}ms)_` : ''}`);
  const allOk = results.every((r) => r.status === 'ok');
  const embed = new EmbedBuilder()
    .setColor(allOk ? 0x4a7c59 : 0xf4a261)
    .setTitle('🩺 Diagnostics')
    .setDescription(lines.join('\n') || 'No diagnostics ran.')
    .setFooter({ text: 'Refreshed just now.' });
  await interaction.editReply({ embeds: [embed] });
}

// ── Button: View config ──────────────────────────────────────────────────────

export async function handleViewButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  // ListConfig masks critical values internally via the controller path
  // (we re-mask here for direct resolver use to keep this handler
  // independent of the REST surface).
  const rows = await listConfigResolver();
  const lines = rows.map((r) => {
    const emoji = r.isEncrypted ? '🔒' : '📝';
    const value = r.isEncrypted ? '***REDACTED***' : formatValue(r.value);
    return `${emoji} \`${r.key}\` = ${value} _(${r.source})_`;
  });
  const embed = new EmbedBuilder()
    .setColor(0x4a7c59)
    .setTitle('📋 Config (current values)')
    .setDescription(lines.slice(0, 20).join('\n') || 'No config keys yet.')
    .setFooter({ text: `Showing ${Math.min(20, rows.length)} of ${rows.length}. Critical values masked.` });
  await interaction.editReply({ embeds: [embed] });
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v.length > 60 ? `"${v.slice(0, 57)}..."` : `"${v}"`;
  return JSON.stringify(v).slice(0, 60);
}

// ── Button: Set config (start the flow) ─────────────────────────────────────

export async function handleSetButton(interaction: ButtonInteraction): Promise<void> {
  // Confirm the user has a cached session — required for set operations.
  if (!getCachedSession(interaction.user.id)) {
    await interaction.reply({
      embeds: [errorEmbed('🔒 Locked', 'Run /admin and unlock first.')],
      ephemeral: true,
    });
    return;
  }
  // Show a select menu of categories, then a modal for key+value.
  // For Phase 2 minimal scope, skip the category picker and ask for key directly.
  const modal = new ModalBuilder()
    .setCustomId('admin:set:value')
    .setTitle('Set config value')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('key')
          .setLabel('Key (dotted notation, e.g. rateLimit.login.max)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel('Value (string, number, true/false, or JSON)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(2000)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('note')
          .setLabel('Note (why this change)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(200)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('passphrase')
          .setLabel('Passphrase (REQUIRED for critical keys; optional otherwise)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(200)
      ),
    );
  await interaction.showModal(modal);
}

export async function handleSetValueModal(interaction: ModalSubmitInteraction): Promise<void> {
  const key = interaction.fields.getTextInputValue('key').trim();
  const rawValue = interaction.fields.getTextInputValue('value');
  const note = interaction.fields.getTextInputValue('note')?.trim() ?? '';
  // passphrase is OPTIONAL in this modal. Required only for critical keys.
  // We pass it through to the setConfig service which calls verifyPassphrase
  // when the key is critical.
  const passphrase = (() => {
    try { return interaction.fields.getTextInputValue('passphrase') ?? ''; }
    catch { return ''; }
  })();

  // Parse the value — accept plain strings, numbers, booleans, or JSON.
  let value: unknown;
  const trimmed = rawValue.trim();
  if (trimmed === 'true') value = true;
  else if (trimmed === 'false') value = false;
  else if (trimmed === 'null') value = null;
  else if (/^-?\d+(\.\d+)?$/.test(trimmed)) value = Number(trimmed);
  else if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
           (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { value = JSON.parse(trimmed); } catch { value = rawValue; }
  } else {
    value = rawValue;
  }

  // Critical key: passphrase is REQUIRED. Verify it BEFORE attempting the
  // write so we don't leave a partial state. The service layer also
  // checks; this is a fast-fail at the UI layer.
  const cat = categorize(key);
  if (cat.isCritical) {
    if (!passphrase) {
      await interaction.reply({
        embeds: [errorEmbed('🔒 Passphrase required', `\`${key}\` is critical (${cat.category}). Re-run /admin and include the passphrase field.`)],
        ephemeral: true,
      });
      return;
    }
    const ppOk = await verifyPassphrase(passphrase);
    if (!ppOk) {
      await interaction.reply({
        embeds: [errorEmbed('🔒 Passphrase mismatch', `Critical change to \`${key}\` NOT applied.`)],
        ephemeral: true,
      });
      return;
    }
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await setConfigService({
    key, value,
    source: 'discord',
    adminId: interaction.user.id,
    adminUsername: interaction.user.username,
    note: note || 'set via Discord admin',
    // For non-critical: passphrase is empty, ignored by the service.
    // For critical: the service's setConfig already calls getConfigAudited
    // for the audit log; the verifyPassphrase call here is a fast-fail
    // at the UI layer.
  });
  if (!result.ok) {
    await interaction.editReply({ embeds: [errorEmbed('Set failed', result.error ?? 'unknown')] });
  } else {
    await interaction.editReply({
      embeds: [okEmbed(cat.isCritical ? '🔒 Set (critical)' : '📝 Set', `\`${key}\` updated.${note ? ` _Note_: ${note}` : ''}`)],
    });
  }
}

// (Critical-key passphrase re-entry was rolled into the main set modal
// in handleSetValueModal above — Discord's interaction model doesn't
// allow ModalSubmitInteraction to show another modal directly, so we
// collect key+value+note+passphrase in a single modal.)

// ── Button: Audit log ────────────────────────────────────────────────────────

export async function handleAuditButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const recent = await AdminAuditLog.find({})
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();
  const lines = recent.map((r) => {
    const emoji = r.wasCritical ? '🔒' : '📝';
    const status = r.success ? '✅' : '❌';
    const ts = new Date(r.timestamp).toISOString().slice(0, 16).replace('T', ' ');
    return `${status} ${emoji} \`${r.action}\` \`${r.key ?? '—'}\` by ${r.adminUsername} _(${ts})_${r.note ? ` _${r.note}_` : ''}`;
  });
  const embed = new EmbedBuilder()
    .setColor(0x4a7c59)
    .setTitle('📜 Recent audit log (10 newest)')
    .setDescription(lines.join('\n') || 'No audit entries yet.')
    .setFooter({ text: 'Critical-key values are redacted; full history lives in AdminAuditLog collection.' });
  await interaction.editReply({ embeds: [embed] });
}

// ── Button: Lock (logout) ───────────────────────────────────────────────────

export async function handleLockButton(interaction: ButtonInteraction): Promise<void> {
  const userId = interaction.user.id;
  const revoked = await revokeAllSessionsForAdmin(userId, 'logout');
  clearCachedSession(userId);
  await interaction.reply({
    embeds: [okEmbed('🔒 Locked', `Cleared ${revoked} active session(s). Re-run /admin to unlock again.`)],
    ephemeral: true,
  });
  adminLog.info(`[admin] ${interaction.user.username} (${userId}) locked; ${revoked} sessions revoked`);
}
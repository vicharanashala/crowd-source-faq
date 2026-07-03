/**
 * commands/admin.ts — `/admin` slash command for the Discord admin panel.
 *
 * This is the single entry point for the Discord admin UX. The command
 * itself just opens the menu (ephemeral message with buttons); the
 * heavy lifting happens in the button/modal handlers in
 * `events/adminHandlers.ts`.
 *
 * Authorisation: gated on the bot's existing `isAdmin()` helper, which
 * checks `config.adminUserIds` (the `ADMIN_DISCORD_USER_IDS` env var).
 * Non-admins get a "this is admin-only" ephemeral response.
 */
import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { BotConfig } from '../discordBot.js';
import { isAdmin } from '../events/interactionCreate.js';
import { adminLog } from '../../../utils/http/logger.js';

export const adminCommandData = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Open the admin panel (config, diagnostics, audit log)')
  .setDefaultMemberPermissions(0) // restrict to admins only (we double-check via isAdmin)
  .toJSON();

export async function executeAdmin(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
  batchId: string | null
): Promise<void> {
  if (!isAdmin(interaction, config)) {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Admin only')
        .setDescription('This command is restricted to configured admins.')],
      ephemeral: true,
    });
    return;
  }

  // Phase 2 keeps the panel intentionally minimal — buttons drive the
  // multi-step flow (passphrase modal, key pickers, value entry). The
  // first button in the row is the gateway: clicking it opens the
  // passphrase modal in adminHandlers.ts. The remaining buttons expose
  // read-only views (diagnostics, audit) so admins can inspect state
  // before unlocking writes.
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin:unlock')
      .setLabel('Unlock admin')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔓'),
    new ButtonBuilder()
      .setCustomId('admin:diagnostics')
      .setLabel('Run diagnostics')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🩺'),
    new ButtonBuilder()
      .setCustomId('admin:view')
      .setLabel('View config')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
    new ButtonBuilder()
      .setCustomId('admin:audit')
      .setLabel('Audit log')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📜'),
  );

  const embed = new EmbedBuilder()
    .setColor(0x4a7c59)
    .setTitle('🔐 Yaksha Admin Panel')
    .setDescription([
      'Click **Unlock admin** to enter your passphrase and unlock write actions.',
      'The other buttons are read-only and work without unlocking.',
      '',
      'Critical keys (🔒) require re-entering the passphrase for each change.',
      'Non-critical keys (📝) only need the initial unlock.',
    ].join('\n'))
    .setFooter({ text: 'All actions are logged to the audit log and #admin-audit-log.' });

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  adminLog.info(`[admin] /admin opened by ${interaction.user.id} (${interaction.user.username}) batchId=${batchId ?? 'global'}`);
}
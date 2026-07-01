/**
 * bot/commands/ban.ts — /ban <user_id_or_email> <reason>
 *
 * Admin. Calls POST
 *   {PUBLIC_URL}/api/moderation/ban?batchId=...
 * (note: the moderation routes are mounted at /api/moderation, NOT
 * /api/admin/users — the bot originally called the wrong path and got
 * 404s; v1.69 Phase 0 fixed the URL). The internal API key bypasses
 * the adminOnly middleware.
 *
 * The batchId is threaded through so each per-program bot only bans
 * users in its own program (when the moderation controller respects
 * batchId — currently it does global moderation, but the param is
 * passed for forward compat).
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../events/interactionCreate.js';
import { logger } from '../../utils/http/logger.js';
import { buildBotApiUrl, botApiHeaders } from '../events/botApi.js';
export const banCommandData = new SlashCommandBuilder()
    .setName('ban')
    .setDescription('[admin] Ban a user account')
    .addStringOption((o) => o.setName('target')
    .setDescription('User id (or email) to ban')
    .setRequired(true))
    .addStringOption((o) => o.setName('reason')
    .setDescription('Reason for the ban (logged + shown to user)')
    .setRequired(true)
    .setMaxLength(300))
    .toJSON();
function errorEmbed(msg) {
    return new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Error')
        .setDescription(msg.slice(0, 1000));
}
export async function executeBan(interaction, config, batchId = null) {
    if (!isAdmin(interaction, config)) {
        await interaction.reply({ content: '🔒 admin only', ephemeral: true });
        return;
    }
    if (!config.internalApiKey) {
        await interaction.reply({ embeds: [errorEmbed('INTERNAL_API_KEY not set')], ephemeral: true });
        return;
    }
    await interaction.deferReply({ ephemeral: true });
    const target = interaction.options.getString('target', true);
    const reason = interaction.options.getString('reason', true);
    try {
        const res = await fetch(buildBotApiUrl(config, '/api/moderation/ban', batchId), {
            method: 'POST',
            headers: { 'X-Internal-Api-Key': config.internalApiKey ?? '', 'Content-Type': 'application/json', ...botApiHeaders(config, batchId) },
            body: JSON.stringify({ target, reason, bannedBy: interaction.user.tag }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
    }
    catch (err) {
        logger.error(`[bot] /ban failed: ${err.message}`);
        await interaction.followUp({ embeds: [errorEmbed(`/ban failed: ${err.message}`)] });
        return;
    }
    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('User banned')
        .addFields({ name: 'Target', value: `\`${target}\`` }, { name: 'Banned by', value: `<@${interaction.user.id}>` }, { name: 'Reason', value: reason.slice(0, 500) })
        .setTimestamp(new Date());
    await interaction.followUp({ embeds: [embed] });
}

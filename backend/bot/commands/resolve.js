/**
 * bot/commands/resolve.ts — /resolve <ticket_id> <note>
 *
 * Admin. Calls PATCH
 *   {PUBLIC_URL}/api/support/requests/:id/status?batchId=...
 * (note: the support PATCH route is at /api/support/requests/:id/status,
 * NOT /api/admin/support/requests/:id — the bot originally called the
 * wrong path and got 404s; v1.69 Phase 0 fixed the URL).
 *
 * The internal API key bypasses the protect+authorize JWT chain on
 * this route so the bot doesn't need a service-account JWT.
 *
 * Triggers a notification-channel post via the controller.
 *
 * v1.69 — Phase 6+ per-guild → batchId routing. The batchId is
 * threaded through so each per-program bot only resolves tickets
 * from its own program.
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../events/interactionCreate.js';
import { logger } from '../../utils/http/logger.js';
import { buildBotApiUrl, botApiHeaders } from '../events/botApi.js';
export const resolveCommandData = new SlashCommandBuilder()
    .setName('resolve')
    .setDescription('[admin] Mark a support ticket as resolved')
    .addStringOption((o) => o.setName('ticket_id')
    .setDescription('The Mongo _id of the ticket (from /tickets)')
    .setRequired(true))
    .addStringOption((o) => o.setName('note')
    .setDescription('Resolution note (visible to the user)')
    .setRequired(true)
    .setMaxLength(500))
    .toJSON();
function errorEmbed(msg) {
    return new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Error')
        .setDescription(msg.slice(0, 1000));
}
export async function executeResolve(interaction, config, batchId = null) {
    if (!isAdmin(interaction, config)) {
        await interaction.reply({ content: '🔒 admin only', ephemeral: true });
        return;
    }
    if (!config.internalApiKey) {
        await interaction.reply({ embeds: [errorEmbed('INTERNAL_API_KEY not set')], ephemeral: true });
        return;
    }
    await interaction.deferReply({ ephemeral: true });
    const ticketId = interaction.options.getString('ticket_id', true).trim();
    const note = interaction.options.getString('note', true);
    try {
        const res = await fetch(buildBotApiUrl(config, `/api/support/requests/${encodeURIComponent(ticketId)}/status`, batchId), {
            method: 'PATCH',
            headers: { 'X-Internal-Api-Key': config.internalApiKey ?? '', 'Content-Type': 'application/json', ...botApiHeaders(config, batchId) },
            body: JSON.stringify({ status: 'resolved', resolutionNote: note, resolvedBy: interaction.user.tag }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
    }
    catch (err) {
        logger.error(`[bot] /resolve failed: ${err.message}`);
        await interaction.followUp({ embeds: [errorEmbed(`/resolve failed: ${err.message}`)] });
        return;
    }
    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('Ticket resolved')
        .addFields({ name: 'Ticket', value: `\`${ticketId}\`` }, { name: 'Resolved by', value: `<@${interaction.user.id}>` }, { name: 'Note', value: note.slice(0, 500) })
        .setTimestamp(new Date());
    await interaction.followUp({ embeds: [embed] });
}

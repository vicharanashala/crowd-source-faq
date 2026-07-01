/**
 * bot/commands/tickets.ts — /tickets [status]
 *
 * Admin. Lists support tickets. Calls
 *   GET {PUBLIC_URL}/api/support/requests?status=...&limit=...&batchId=...
 * (note: the support routes are mounted at /api/support, NOT
 * /api/admin/support — the bot originally called the wrong path and
 * got 404s; v1.69 Phase 0 fixed the URL). The internal API key in
 * the header lets us bypass the JWT requirement on this protect-guarded
 * route.
 *
 * The batchId is threaded through (Phase 6+) so each per-program bot
 * only lists its own tickets.
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../events/interactionCreate.js';
import { logger } from '../../utils/http/logger.js';
import { buildBotApiUrl, botApiHeaders } from '../events/botApi.js';
export const ticketsCommandData = new SlashCommandBuilder()
    .setName('tickets')
    .setDescription('[admin] List support tickets')
    .addStringOption((o) => o.setName('status')
    .setDescription('Filter by status (default: open)')
    .setRequired(false)
    .addChoices({ name: 'open', value: 'open' }, { name: 'in_review', value: 'in_review' }, { name: 'resolved', value: 'resolved' }, { name: 'rejected', value: 'rejected' }, { name: 'closed', value: 'closed' }))
    .addIntegerOption((o) => o.setName('limit')
    .setDescription('How many to show (1-25, default 10)')
    .setMinValue(1)
    .setMaxValue(25))
    .toJSON();
function errorEmbed(msg) {
    return new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Error')
        .setDescription(msg.slice(0, 1000));
}
export async function executeTickets(interaction, config, batchId = null) {
    if (!isAdmin(interaction, config)) {
        await interaction.reply({ content: '🔒 admin only', ephemeral: true });
        return;
    }
    if (!config.internalApiKey) {
        await interaction.reply({
            embeds: [errorEmbed('INTERNAL_API_KEY not set in .env. The /tickets command can\'t talk to the admin endpoint without it.')],
            ephemeral: true,
        });
        return;
    }
    await interaction.deferReply({ ephemeral: true });
    const status = interaction.options.getString('status') ?? 'open';
    const limit = interaction.options.getInteger('limit') ?? 10;
    let tickets = [];
    try {
        const basePath = `/api/support/requests?status=${encodeURIComponent(status)}&limit=${limit}`;
        const res = await fetch(buildBotApiUrl(config, basePath, batchId), { headers: { 'X-Internal-Api-Key': config.internalApiKey ?? '', ...botApiHeaders(config, batchId) } });
        if (res.ok) {
            const data = await res.json();
            tickets = data.requests ?? [];
        }
        else {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
    }
    catch (err) {
        logger.error(`[bot] /tickets fetch failed: ${err.message}`);
        await interaction.followUp({ embeds: [errorEmbed(`/tickets failed: ${err.message}`)] });
        return;
    }
    if (tickets.length === 0) {
        await interaction.followUp({
            embeds: [new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle(`No tickets with status "${status}"`)],
        });
        return;
    }
    const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`Support tickets: ${status} (${tickets.length})`)
        .setTimestamp(new Date());
    for (const t of tickets) {
        const ageDays = t.createdAt ? Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400_000) : '?';
        const golden = t.isGolden ? ' 🏆' : '';
        embed.addFields({
            name: `${t.issueType ?? 'unknown'}${golden} — ${t.userName ?? t.userId ?? '?'}`,
            value: [
                `**id:** \`${t._id}\``,
                `**age:** ${ageDays} day(s)`,
                `**desc:** ${(t.description ?? '').slice(0, 200)}${(t.description?.length ?? 0) > 200 ? '…' : ''}`,
            ].join('\n'),
        });
    }
    embed.setFooter({ text: 'Use /resolve <id> <note> to close one.' });
    await interaction.followUp({ embeds: [embed] });
}

/**
 * bot/commands/broadcast.ts — /broadcast <message>
 *
 * Admin. Posts a message to the configured notification
 * channel. Phase 6+ uses the per-program
 * notificationChannelId so each per-program bot posts to
 * its own channel.
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../events/interactionCreate.js';
import { logger } from '../../utils/http/logger.js';
export const broadcastCommandData = new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('[admin] Post a message to the program notification channel')
    .addStringOption((o) => o.setName('message')
    .setDescription('The message to broadcast')
    .setRequired(true)
    .setMaxLength(1000))
    .toJSON();
function errorEmbed(msg) {
    return new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Error')
        .setDescription(msg.slice(0, 1000));
}
export async function executeBroadcast(interaction, config, _batchId = null) {
    if (!isAdmin(interaction, config)) {
        await interaction.reply({ content: '🔒 admin only', ephemeral: true });
        return;
    }
    if (!config.notificationChannelId) {
        await interaction.reply({ embeds: [errorEmbed('No notification channel configured for this program. Set one in the Programs Hub Discord tab.')], ephemeral: true });
        return;
    }
    await interaction.deferReply({ ephemeral: true });
    const message = interaction.options.getString('message', true);
    try {
        // Phase 6+: the per-program bot posts to its own guild's
        // notification channel. The discord.js client lives on
        // the interaction (cast to the discord.js Client type).
        const client = interaction.client;
        const channel = await client.channels.fetch(config.notificationChannelId);
        if (!channel || typeof channel.send !== 'function') {
            throw new Error(`Channel ${config.notificationChannelId} is not a text channel`);
        }
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('Admin broadcast')
            .setDescription(message.slice(0, 3500))
            .setFooter({ text: `Posted by <@${interaction.user.id}> in this program's channel` })
            .setTimestamp(new Date());
        await channel.send({ embeds: [embed] });
    }
    catch (err) {
        logger.error(`[bot] /broadcast failed: ${err.message}`);
        await interaction.followUp({ embeds: [errorEmbed(`/broadcast failed: ${err.message}`)] });
        return;
    }
    await interaction.followUp({
        embeds: [new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('Broadcast posted')
                .setDescription(`Posted to <#${config.notificationChannelId}>`)],
    });
}

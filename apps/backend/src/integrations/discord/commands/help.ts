/**
 * bot/commands/help.ts — /help
 *
 * Public. Lists every command, marks admin-only ones, and
 * shows whether the calling user has admin access.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../events/interactionCreate.js';
import type { BotConfig } from '../discordBot.js';

export const helpCommandData = new SlashCommandBuilder()
  .setName('help')
  .setDescription('List all available commands')
  .toJSON();

interface HelpEntry {
  name: string;
  description: string;
  adminOnly: boolean;
  example?: string;
}

const COMMANDS: HelpEntry[] = [
  { name: '/ask <question>', description: 'Ask the Yaksha knowledge base (RAG over FAQs + community + KB).', adminOnly: false, example: '/ask how do I submit the NOC' },
  { name: '/search <query>', description: 'Search FAQs + community posts + KB. Returns top N with scores.', adminOnly: false, example: '/search offer letter' },
  { name: '/status', description: 'Server health snapshot (DB connection, version, etc.).', adminOnly: false },
  { name: '/help', description: 'This list.', adminOnly: false },
  { name: '/tickets [status]', description: 'List support tickets. status = open|in_review|resolved|rejected|closed. Default: open.', adminOnly: true, example: '/tickets in_review' },
  { name: '/resolve <ticket_id> <note>', description: 'Mark a support ticket resolved. Posts a confirmation in the ticket thread.', adminOnly: true, example: '/resolve 6a2d… "device battery replaced"' },
  { name: '/ban <user_id_or_email> <reason>', description: 'Ban a user. Posts an audit-log entry to the notification channel.', adminOnly: true, example: '/ban meow@yaksha.com Spam' },
  { name: '/broadcast <message>', description: 'Post a message to the configured notification channel. Use sparingly.', adminOnly: true, example: '/broadcast Maintenance window tonight 10pm-11pm IST' },
];

export async function executeHelp(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
  batchId: string | null = null
): Promise<void> {
  const userIsAdmin = isAdmin(interaction, config);
  const lines = COMMANDS.map((c) => {
    const tag = c.adminOnly ? '🔒 admin' : '🌐 public';
    const visible = !c.adminOnly || userIsAdmin;
    const example = c.example ? `\n   ↳ \`${c.example}\`` : '';
    return visible
      ? `**${c.name}** _${tag}_\n${c.description}${example}`
      : `~~**${c.name}** _${tag}_~~ _— admin only_`;
  });

  const embed = new EmbedBuilder()
    .setColor(userIsAdmin ? 0xfee75c : 0x5865f2)
    .setTitle(userIsAdmin ? 'Yaksha bot — admin commands' : 'Yaksha bot — public commands')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `You are ${userIsAdmin ? 'an admin' : 'a public user'} (Discord id ${interaction.user.id})` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

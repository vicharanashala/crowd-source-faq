import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { BotConfig } from '../discordBot.js';
import { isAdmin } from '../events/interactionCreate.js';
import User from '../../../modules/auth/user.model.js';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { logger, securityLog } from '../../../utils/http/logger.js';

export const setupAdminCommandData = new SlashCommandBuilder()
  .setName('setupadmin')
  .setDescription('Seed a new portal admin account and generate a JWT access token.')
  .addStringOption((option) =>
    option.setName('name').setDescription('Admin Full Name').setRequired(true)
  )
  .addStringOption((option) =>
    option.setName('email').setDescription('Admin Login Email').setRequired(true)
  )
  .addStringOption((option) =>
    option.setName('password').setDescription('Admin Password (min 6 chars)').setRequired(true)
  )
  .setDefaultMemberPermissions(0) // restrict to admins only
  .toJSON();

export async function executeSetupAdmin(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
  batchId: string | null
): Promise<void> {
  if (!isAdmin(interaction, config)) {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Admin only')
        .setDescription('This command is restricted to configured Discord admins.')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString('name', true).trim();
  const email = interaction.options.getString('email', true).trim().toLowerCase();
  const password = interaction.options.getString('password', true).trim();

  if (password.length < 6) {
    await interaction.editReply({
      content: '❌ Error: Password must be at least 6 characters long.',
    });
    return;
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      await interaction.editReply({
        content: `❌ Error: A user with the email '${email}' already exists.`,
      });
      return;
    }

    const adminUser = new User({
      name,
      email,
      password,
      role: 'admin',
      sp: 100,
      reputation: 0,
      points: 0,
      tier: 'newcomer',
      isBanned: false,
      isDeleted: false
    });

    await adminUser.save();
    const userId = adminUser._id.toString();

    let jwtTokenMessage = '';
    const secret = process.env.JWT_SECRET;
    if (secret) {
      const jti = uuidv4();
      const token = jwt.sign({ id: userId, jti }, secret, { expiresIn: '7d' });
      jwtTokenMessage = `\n\n**🎫 Signed JWT Access Token (Expires in 7 days):**\n\`\`\`\n${token}\n\`\`\``;
    }

    securityLog.alert('admin created via discord slash command', {
      discordUser: interaction.user.id,
      seededEmail: email,
      userId
    });

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x4a7c59)
        .setTitle('🚀 Admin Created Successfully!')
        .setDescription([
          `**Name:** ${name}`,
          `**Email:** ${email}`,
          `**ID:** ${userId}`,
          jwtTokenMessage
        ].join('\n'))],
    });

  } catch (err) {
    logger.error(`[bot] /setupadmin error: ${(err as Error).message}`);
    await interaction.editReply({
      content: `❌ Error seeding admin: ${(err as Error).message}`,
    });
  }
}

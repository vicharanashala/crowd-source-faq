/**
 * commands/crud.ts — `/crud` slash command for admin CRUD.
 *
 * Single Discord command that exposes CRUD across every entity the
 * bot can manage. Built with Discord subcommand groups so admins can
 * type `/crud <entity> <op> ...` (e.g. `/crud faqs list page:2`).
 *
 * Layout: 10 entity groups × 5 ops = 50 subcommands.
 *   faqs, web-pages, documents, programs, batches, golden-tickets,
 *   support-tickets, users, feature-flags, audit-logs ×
 *   list, view, create, update, delete
 *
 * Why one command + groups (instead of one command per entity):
 *   - Discord's 25-subcommand-per-group cap forces us to split
 *     entities into multiple commands as the list grows. Groups
 *     inside one command are cleaner and easier to extend.
 *   - The handler layer (`admin/adminCrud.ts`) is already entity-
 *     generic; this layer just routes.
 *
 * Create / update still emit ephemeral "send me the fields" messages;
 * modals are a follow-up. List / view / delete use real API calls.
 *
 * Auth: gated on `isAdmin()` (same pattern as `/admin`).
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import type { BotConfig } from '../discordBot.js';
import { isAdmin } from '../events/interactionCreate.js';
import * as crud from '../admin/adminCrud.js';

type EntityKey =
  | 'faqs'
  | 'web-pages'
  | 'documents'
  | 'programs'
  | 'batches'
  | 'golden-tickets'
  | 'support-tickets'
  | 'users'
  | 'feature-flags'
  | 'audit-logs';
type OpKey = 'list' | 'view' | 'create' | 'update' | 'delete';

const ENTITIES: EntityKey[] = [
  'faqs', 'web-pages', 'documents',
  'programs', 'batches', 'golden-tickets',
  'support-tickets', 'users', 'feature-flags',
  'audit-logs',
];
const OPS: OpKey[] = ['list', 'view', 'create', 'update', 'delete'];

/** Dispatch table — `adminCrud.ts` exports one fn per (entity, op). */
const HANDLERS: Record<EntityKey, Record<OpKey, (args: { id?: string; page?: number }) => Promise<crud.AdminCrudResult>>> = {
  'faqs':          { list: ({ page }) => crud.faqList(page ?? 1),          view: ({ id }) => require_id(id, crud.faqView),         create: () => crud.faqCreate(),          update: ({ id }) => require_id(id, crud.faqUpdate),          delete: ({ id }) => require_id(id, crud.faqDelete) },
  'web-pages':     { list: ({ page }) => crud.webPageList(page ?? 1),     view: ({ id }) => require_id(id, crud.webPageView),     create: () => crud.webPageCreate(),      update: ({ id }) => require_id(id, crud.webPageUpdate),    delete: ({ id }) => require_id(id, crud.webPageDelete) },
  'documents':     { list: ({ page }) => crud.documentList(page ?? 1),   view: ({ id }) => require_id(id, crud.documentView),   create: () => crud.documentCreate(),    update: ({ id }) => require_id(id, crud.documentUpdate),  delete: ({ id }) => require_id(id, crud.documentDelete) },
  'programs':      { list: ({ page }) => crud.programList(page ?? 1),    view: ({ id }) => require_id(id, crud.programView),    create: () => crud.programCreate(),     update: ({ id }) => require_id(id, crud.programUpdate),   delete: ({ id }) => require_id(id, crud.programDelete) },
  'batches':       { list: ({ page }) => crud.batchList(page ?? 1),      view: ({ id }) => require_id(id, crud.batchView),      create: () => crud.batchCreate(),       update: ({ id }) => require_id(id, crud.batchUpdate),     delete: ({ id }) => require_id(id, crud.batchDelete) },
  'golden-tickets':{ list: ({ page }) => crud.goldenList(page ?? 1),     view: ({ id }) => crud.goldenView(id ?? ''),           create: () => crud.goldenCreate(),       update: ({ id }) => require_id(id, crud.goldenUpdate),   delete: ({ id }) => require_id(id, crud.goldenDelete) },
  'support-tickets':{list: ({ page }) => crud.supportList(page ?? 1),   view: ({ id }) => require_id(id, crud.supportView),   create: () => crud.supportCreate(),    update: ({ id }) => require_id(id, crud.supportUpdate),  delete: ({ id }) => require_id(id, crud.supportDelete) },
  'users':         { list: ({ page }) => crud.userList(page ?? 1),        view: ({ id }) => crud.userView(id ?? ''),            create: () => crud.userCreate(),        update: ({ id }) => require_id(id, crud.userUpdate),     delete: ({ id }) => require_id(id, crud.userDelete) },
  'feature-flags': { list: ({ page }) => crud.flagList(page ?? 1),      view: ({ id }) => crud.flagView(id ?? ''),             create: () => crud.flagCreate(),       update: ({ id }) => require_id(id, crud.flagUpdate),    delete: ({ id }) => require_id(id, crud.flagDelete) },
  'audit-logs':    { list: ({ page }) => crud.auditList(page ?? 1),      view: ({ id }) => crud.auditView(id ?? ''),            create: () => crud.auditCreate(),      update: ({ id }) => require_id(id, crud.auditUpdate),   delete: ({ id }) => require_id(id, crud.auditDelete) },
};

function require_id(id: string | undefined, fn: (id: string) => Promise<crud.AdminCrudResult>): Promise<crud.AdminCrudResult> {
  if (!id) {
    return Promise.resolve({ ephemeral: '❌ This operation requires an `<id>` argument.' });
  }
  return fn(id);
}

/**
 * Build the SlashCommandBuilder declaratively. Each entity is a
 * subcommand *group* containing five subcommands. We add the `id`
 * and `page` options only on the subcommands that need them.
 */
export const crudCommandData = (() => {
  const builder = new SlashCommandBuilder()
    .setName('crud')
    .setDescription('[admin] CRUD on FAQs, web pages, docs, programs, batches, tickets, users, flags, audit')
    .setDefaultMemberPermissions(0); // server-side double-check via isAdmin

  for (const entity of ENTITIES) {
    builder.addSubcommandGroup((group) => {
      group.setName(entity).setDescription(`CRUD for ${entity}`);
      for (const op of OPS) {
        group.addSubcommand((sub) => {
          sub.setName(op).setDescription(`${op} ${entity}`);
          if (op === 'view' || op === 'update' || op === 'delete') {
            sub.addStringOption((o) =>
              o.setName('id')
                .setDescription('Entity id (Mongo ObjectId)')
                .setRequired(true),
            );
          }
          if (op === 'list') {
            sub.addIntegerOption((o) =>
              o.setName('page')
                .setDescription('Page number (default 1)')
                .setMinValue(1)
                .setMaxValue(1000),
            );
          }
          return sub;
        });
      }
      return group;
    });
  }

  return builder.toJSON();
})();

/** Reply helper — handles both `embeds` and `ephemeral` result shapes. */
async function replyResult(
  interaction: ChatInputCommandInteraction,
  result: crud.AdminCrudResult,
): Promise<void> {
  if ('ephemeral' in result && result.ephemeral) {
    await interaction.reply({ content: result.ephemeral, ephemeral: true });
    return;
  }
  await interaction.reply({
    embeds: (result.embeds ?? []).length
      ? result.embeds
      : [new EmbedBuilder().setColor(0x4a7c59).setTitle('✅ done')],
    ephemeral: true,
  });
}

export async function executeCrud(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
  _batchId: string | null = null,
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

  // With subcommand groups, Discord gives us both names directly.
  const entity = interaction.options.getSubcommandGroup() as EntityKey;
  const op = interaction.options.getSubcommand() as OpKey;

  if (!ENTITIES.includes(entity) || !OPS.includes(op)) {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Unknown subcommand')
        .setDescription(`\`/crud ${entity} ${op}\` isn't registered.`)],
      ephemeral: true,
    });
    return;
  }

  const id = interaction.options.getString('id') ?? undefined;
  const page = interaction.options.getInteger('page') ?? undefined;

  try {
    const handler = HANDLERS[entity][op];
    const result = await handler({ id, page });
    await replyResult(interaction, result);
  } catch (err) {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('CRUD handler failed')
        .setDescription(`\`${(err as Error).message}\``)],
      ephemeral: true,
    });
  }
}

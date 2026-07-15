#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR =
  process.env.SEED_DATA_DIR ||
  path.resolve(process.cwd(), 'data');

const DEFAULT_PASSWORD = 'changeme123';

type SeedReport = {
  entities: { name: string; inserted: number; skipped: number; failed: number }[];
  add(entity: string, inserted: number, skipped: number, failed: number): void;
  print(): void;
};

function createReport(): SeedReport {
  const entities: { name: string; inserted: number; skipped: number; failed: number }[] = [];
  return {
    entities,
    add(entity: string, inserted: number, skipped: number, failed: number) {
      entities.push({ name: entity, inserted, skipped, failed });
    },
    print() {
      const header = `  ${'Entity'.padEnd(28)} ${'Inserted'.padStart(9)} ${'Skipped'.padStart(8)} ${'Failed'.padStart(7)}`;
      const sep = `  ${'-'.repeat(27)} ${'-'.repeat(9)} ${'-'.repeat(8)} ${'-'.repeat(7)}`;
      console.log(header);
      console.log(sep);
      let totalInserted = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      for (const e of entities) {
        console.log(`  ${e.name.padEnd(28)} ${String(e.inserted).padStart(9)} ${String(e.skipped).padStart(8)} ${String(e.failed).padStart(7)}`);
        totalInserted += e.inserted;
        totalSkipped += e.skipped;
        totalFailed += e.failed;
      }
      console.log(sep);
      console.log(`  ${'TOTAL'.padEnd(28)} ${String(totalInserted).padStart(9)} ${String(totalSkipped).padStart(8)} ${String(totalFailed).padStart(7)}`);
    },
  };
}

const report = createReport();

async function loadEnv(): Promise<void> {
  const envPath = path.resolve(__dirname, '..', 'apps', 'backend', '.env');
  try {
    const content = await fs.readFile(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* .env may not exist */
  }
}

async function readJson<T = unknown>(filename: string): Promise<T> {
  const raw = await fs.readFile(path.join(DATA_DIR, filename), 'utf-8');
  return JSON.parse(raw) as T;
}

function log(emoji: string, msg: string): void {
  console.log(`  ${emoji} ${msg}`);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysAgoMin: number, daysAgoMax: number): Date {
  const now = Date.now();
  const ms = now - randomInt(daysAgoMin, daysAgoMax) * 86400000;
  return new Date(ms);
}

function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s'-]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isObjectIdLike(v: unknown): boolean {
  if (v instanceof mongoose.Types.ObjectId) return true;
  if (typeof v === 'string' && /^[a-fA-F0-9]{24}$/.test(v)) return true;
  return false;
}

async function discoverModels(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await discoverModels(full)));
    } else if (entry.name.endsWith('.model.ts') || entry.name.endsWith('.model.js')) {
      results.push(full);
    }
  }
  return results;
}

const USER_ROLE_MAP: Record<string, string> = {
  student: 'user',
  mentor: 'moderator',
  admin: 'admin',
  user: 'user',
  moderator: 'moderator',
  ai_moderator: 'ai_moderator',
  expert: 'expert',
};

const FAQ_STATUS_MAP: Record<string, string> = {
  published: 'approved',
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
};

const POST_STATUS_MAP: Record<string, string> = {
  open: 'unanswered',
  answered: 'answered',
  unanswered: 'unanswered',
};

async function seed(): Promise<void> {
  await loadEnv();

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not set in environment or apps/backend/.env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.\n');

    // ── Auto-discover & import Mongoose models ──────────────────────────
    console.log('Discovering Mongoose models...');
    const searchDirs = [
      path.resolve(__dirname, '..', 'apps', 'backend', 'src', 'modules'),
      path.resolve(__dirname, '..', 'apps', 'backend', 'src', 'models'),
    ];

    const allModelFiles: string[] = [];
    for (const dir of searchDirs) {
      allModelFiles.push(...(await discoverModels(dir)));
    }

    let imported = 0;
    let importErrCount = 0;
    for (const file of allModelFiles) {
      try {
        await import(pathToFileURL(file).href);
        imported++;
      } catch {
        importErrCount++;
      }
    }

    const registered = Object.keys(mongoose.models);
    log('✓', `${imported} model files imported`);
    if (importErrCount > 0) log('⚠', `${importErrCount} model files had import errors (non-critical models may be missing)`);
    log('✓', `${registered.length} models registered: ${registered.join(', ')}`);
    console.log();

    // ── Validate required models ────────────────────────────────────────
    const required = ['Category', 'User', 'FAQ', 'CommunityPost', 'Batch'];
    const missing = required.filter((n) => !mongoose.models[n]);
    if (missing.length > 0) {
      throw new Error(
        `Required models not registered: ${missing.join(', ')}. ` +
          `Check model file compilation.`,
      );
    }

    const Category = mongoose.models.Category;
    const User = mongoose.models.User;
    const FAQ = mongoose.models.FAQ;
    const CommunityPost = mongoose.models.CommunityPost;
    const Batch = mongoose.models.Batch;

    // ── Bootstrap default Batch ─────────────────────────────────────────
    console.log('Bootstrapping default Batch...');
    let defaultBatch = await Batch.findOne({ isDefault: true });
    if (!defaultBatch) {
      defaultBatch = await Batch.findOne({ name: 'Yaksha 2026-27' });
      if (defaultBatch) {
        defaultBatch.isDefault = true;
        await defaultBatch.save();
        log('✓', `Promoted existing batch "${defaultBatch.name}" to isDefault`);
      } else {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 2);
        defaultBatch = await Batch.create({
          name: 'Yaksha 2026-27',
          description: 'The two-month, full-time research internship at the Vicharanashala Lab, IIT Ropar.',
          startDate: new Date(),
          endDate,
          isActive: true,
          isDefault: true,
        });
        log('✓', `Created default batch "${defaultBatch.name}" (${defaultBatch._id})`);
      }
    } else {
      log('✓', `Default batch exists: "${defaultBatch.name}" (${defaultBatch._id})`);
    }
    console.log();

    // ── Clear old data (reverse dependency order) ──────────────────────
    console.log('Clearing old collections...');
    await CommunityPost.deleteMany({});
    await FAQ.deleteMany({});
    await User.deleteMany({});
    await Category.deleteMany({});
    log('✓', 'Cleared CommunityPosts, FAQs, Users, Categories');
    console.log();

    // ── Read all JSON data files ────────────────────────────────────────
    console.log('Reading data files...');
    const categoriesRaw = await readJson<Record<string, unknown>[]>('categories.json');
    const usersRaw = await readJson<Record<string, unknown>[]>('users.json');
    const faqsPart1 = await readJson<Record<string, unknown>[]>('faqs.json');
    const faqsPart3 = await readJson<Record<string, unknown>[]>('faqs-part-3.json');
    const postsRaw = await readJson<Record<string, unknown>[]>('community-posts-part-1.json');
    const commentsRaw = await readJson<Record<string, unknown>[]>('comments.json');
    const tagsRaw = await readJson<string[]>('tags.json');
    const statsRaw = await readJson<Record<string, unknown>>('statistics.json');

    const allFaqs = [...faqsPart1, ...faqsPart3];
    log('✓', [
      `${categoriesRaw.length} categories`,
      `${usersRaw.length} users`,
      `${allFaqs.length} FAQs (part-1: ${faqsPart1.length} + part-3: ${faqsPart3.length})`,
      `${postsRaw.length} community posts`,
      `${commentsRaw.length} comments`,
      `${tagsRaw.length} tags`,
      `${Object.keys(statsRaw).length} statistics`,
    ].join(', '));
    console.log();

    // ── 1. Categories ──────────────────────────────────────────────────
    console.log('Seeding Categories...');
    const categoryByName = new Map<string, mongoose.Types.ObjectId>();
    let categoriesInserted = 0;
    let categoriesSkipped = 0;
    let categoriesFailed = 0;

    for (const raw of categoriesRaw) {
      try {
        const name = String(raw.name || '').trim();
        const slug = String(raw.slug || '').trim();
        if (!name || !slug) {
          log('⚠', `Category skipped: missing name or slug`);
          categoriesSkipped++;
          continue;
        }

        const doc: Record<string, unknown> = {
          batchId: defaultBatch._id,
          name,
          slug,
          description: raw.description || '',
        };
        if (raw._id && isObjectIdLike(raw._id)) doc._id = new mongoose.Types.ObjectId(raw._id as string);
        const created = await Category.create(doc);
        categoryByName.set(name, created._id);
        categoriesInserted++;
      } catch (err) {
        log('⚠', `Category "${raw.name}" failed: ${(err as Error).message}`);
        categoriesFailed++;
      }
    }
    report.add('Categories', categoriesInserted, categoriesSkipped, categoriesFailed);
    log('✓', `${categoriesInserted} Categories inserted`);
    if (categoriesSkipped > 0 || categoriesFailed > 0) {
      console.log(`       (${categoriesSkipped} skipped, ${categoriesFailed} failed)`);
    }
    console.log();

    // ── 2. Tags (no dedicated model — string arrays on FAQ/CommunityPost) ─
    log('✓', `${tagsRaw.length} Tags acknowledged`);
    console.log();

    // ── 3. Users ───────────────────────────────────────────────────────
    console.log('Seeding Users...');
    const userByName = new Map<string, mongoose.Types.ObjectId>();
    const seenEmails = new Set<string>();
    let usersInserted = 0;
    let usersSkipped = 0;
    let usersFailed = 0;

    for (const raw of usersRaw) {
      try {
        const email = String(raw.email || '').toLowerCase().trim();
        if (!email) {
          log('⚠', `User "${raw.name}" skipped: missing email`);
          usersSkipped++;
          continue;
        }
        if (seenEmails.has(email)) {
          log('⚠', `User "${raw.name}" skipped: duplicate email "${email}"`);
          usersSkipped++;
          continue;
        }
        seenEmails.add(email);

        const name = String(raw.name || '').trim();
        if (!name) {
          log('⚠', `User skipped: missing name (email: ${email})`);
          usersSkipped++;
          continue;
        }

        const role = USER_ROLE_MAP[(raw.role as string)?.toLowerCase()] || 'user';
        const doc: Record<string, unknown> = {
          name,
          email,
          password: DEFAULT_PASSWORD,
          role,
          reputation: typeof raw.reputation === 'number' ? raw.reputation : 0,
        };
        if (raw._id && isObjectIdLike(raw._id)) doc._id = new mongoose.Types.ObjectId(raw._id as string);
        const created = await User.create(doc);
        userByName.set(name, created._id);
        usersInserted++;
      } catch (err) {
        log('⚠', `User "${raw.name}" failed: ${(err as Error).message}`);
        usersFailed++;
      }
    }
    report.add('Users', usersInserted, usersSkipped, usersFailed);
    log('✓', `${usersInserted} Users inserted`);
    if (usersSkipped > 0 || usersFailed > 0) {
      console.log(`       (${usersSkipped} skipped, ${usersFailed} failed)`);
    }
    console.log();

    // ── 4. FAQs (merged) ───────────────────────────────────────────────
    console.log('Seeding FAQs...');
    const seenFaqQuestions = new Set<string>();
    let faqsInserted = 0;
    let faqsSkipped = 0;
    let faqsFailed = 0;

    for (const raw of allFaqs) {
      try {
        const question = String(raw.question || '').trim();
        const normalized = normalizeQuestion(question);
        if (!normalized) {
          log('⚠', `FAQ skipped: missing question`);
          faqsSkipped++;
          continue;
        }
        if (seenFaqQuestions.has(normalized)) {
          faqsSkipped++;
          continue;
        }
        seenFaqQuestions.add(normalized);

        const answer = String(raw.answer || '').trim();
        if (!answer) {
          log('⚠', `FAQ "${question.slice(0, 60)}..." skipped: missing answer`);
          faqsSkipped++;
          continue;
        }

        const categoryName = String(raw.category || 'General').trim();
        const catId = categoryByName.get(categoryName);

        const doc: Record<string, unknown> = {
          question,
          answer,
          tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
          views: randomInt(50, 9000),
          helpfulVotes: randomInt(20, 1600),
          status: FAQ_STATUS_MAP[(raw.status as string)?.toLowerCase()] || 'approved',
          batchId: defaultBatch._id,
          createdAt: randomDate(90, 1),
          updatedAt: randomDate(30, 0),
        };

        // category string is already on the schema; also optionally set categoryId ref
        if (catId) {
          doc.category = categoryName;
          doc.categoryId = catId;
        } else {
          doc.category = categoryName;
        }

        if (raw._id && isObjectIdLike(raw._id)) doc._id = new mongoose.Types.ObjectId(raw._id as string);
        await FAQ.create(doc);
        faqsInserted++;
      } catch (err) {
        const qPreview = String(raw.question || '?').slice(0, 60);
        log('⚠', `FAQ "${qPreview}..." failed: ${(err as Error).message}`);
        faqsFailed++;
      }
    }
    report.add('FAQs', faqsInserted, faqsSkipped, faqsFailed);
    log('✓', `${faqsInserted} FAQs inserted`);
    if (faqsSkipped > 0 || faqsFailed > 0) {
      console.log(`       (${faqsSkipped} duplicate/question skipped, ${faqsFailed} failed)`);
    }
    console.log();

    // ── 5. Community Posts ─────────────────────────────────────────────
    console.log('Seeding Community Posts...');

    const allAuthorNames = new Set<string>();
    for (const p of postsRaw) if (p.author) allAuthorNames.add(String(p.author));
    for (const c of commentsRaw) if (c.author) allAuthorNames.add(String(c.author));

    for (const name of allAuthorNames) {
      if (userByName.has(name)) continue;
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/\.+/g, '.')
        .replace(/^\.|\.$/g, '')
        .slice(0, 40);
      const doc = await User.create({
        name,
        email: `${slug || 'user'}@seed.example.com`,
        password: DEFAULT_PASSWORD,
        role: 'user',
        reputation: 0,
      });
      userByName.set(name, doc._id);
    }

    const commentsByPostTitle = new Map<string, Record<string, unknown>[]>();
    for (const c of commentsRaw) {
      const title = String(c.postTitle || '');
      if (!title) continue;
      if (!commentsByPostTitle.has(title)) commentsByPostTitle.set(title, []);
      commentsByPostTitle.get(title)!.push(c);
    }

    let postsInserted = 0;
    let postsSkipped = 0;
    let postsFailed = 0;
    let commentsEmbedded = 0;
    let commentsSkipped = 0;

    for (const raw of postsRaw) {
      try {
        const title = String(raw.title || '').trim();
        const body = String(raw.content || '').trim();
        if (!title || !body) {
          log('⚠', `Post skipped: missing title or content`);
          postsSkipped++;
          continue;
        }

        const rawAuthor = raw.author;
        let authorId: mongoose.Types.ObjectId | undefined;

        if (isObjectIdLike(rawAuthor)) {
          authorId = new mongoose.Types.ObjectId(rawAuthor as string);
        } else {
          authorId = userByName.get(String(rawAuthor));
        }

        if (!authorId) {
          log('⚠', `Post "${title}" skipped: author "${rawAuthor}" unresolved`);
          postsSkipped++;
          continue;
        }

        const postComments: Record<string, unknown>[] = [];
        const matchedComments = commentsByPostTitle.get(title) || [];
        for (const c of matchedComments) {
          try {
            const cBody = String(c.content || '').trim();
            if (!cBody) {
              commentsSkipped++;
              continue;
            }

            let commentAuthorId: mongoose.Types.ObjectId | undefined;
            if (isObjectIdLike(c.author)) {
              commentAuthorId = new mongoose.Types.ObjectId(c.author as string);
            } else {
              commentAuthorId = userByName.get(String(c.author));
            }
            if (!commentAuthorId) {
              commentsSkipped++;
              continue;
            }

            postComments.push({
              author: commentAuthorId,
              body: cBody,
              verified: c.isAcceptedAnswer === true,
            });
          } catch {
            commentsSkipped++;
          }
        }
        commentsEmbedded += postComments.length;
        commentsByPostTitle.delete(title);

        const tags: string[] = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
        const status = POST_STATUS_MAP[String(raw.status)] || 'unanswered';

        const doc: Record<string, unknown> = {
          title,
          body,
          author: authorId,
          tags,
          status,
          batchId: defaultBatch._id,
          comments: postComments,
          createdAt: randomDate(90, 1),
          updatedAt: randomDate(30, 0),
        };

        if (raw._id && isObjectIdLike(raw._id)) doc._id = new mongoose.Types.ObjectId(raw._id as string);
        await CommunityPost.create(doc);
        postsInserted++;
      } catch (err) {
        log('⚠', `Post "${String(raw.title || '?')}" failed: ${(err as Error).message}`);
        postsFailed++;
      }
    }

    report.add('Community Posts', postsInserted, postsSkipped, postsFailed);
    report.add('Comments (embedded)', commentsEmbedded, commentsSkipped, 0);

    log('✓', `${postsInserted} Community Posts inserted`);
    if (postsSkipped > 0 || postsFailed > 0) {
      console.log(`       (${postsSkipped} skipped, ${postsFailed} failed)`);
    }
    console.log();

    // ── 6. Comments (embedded) ─────────────────────────────────────────
    log('✓', `${commentsEmbedded} Comments embedded in Community Posts`);

    const unmatched = Array.from(commentsByPostTitle.values()).flat();
    if (unmatched.length > 0) {
      log('⚠', `${unmatched.length} comments had no matching community post and were skipped`);
    }
    console.log();

    // ── 7. Tags & Statistics (informational) ───────────────────────────
    log('✓', `${tagsRaw.length} Tags available as string arrays`);
    log('✓', `Statistics logged: ${Object.keys(statsRaw).length} metrics`);

    console.log('\n' + '='.repeat(60));
    console.log('  SEED SUMMARY REPORT');
    console.log('='.repeat(60));
    report.print();
    console.log('='.repeat(60));
    console.log('Seeding completed successfully!\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\nSeeding error:', error);
    try {
      await mongoose.disconnect();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}

seed();

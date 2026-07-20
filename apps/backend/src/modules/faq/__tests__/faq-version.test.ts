import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import FAQ from '../faq.model.js';
import FaqVersion from '../faq-version.model.js';
import Batch from '../../program/batch.model.js';
import { createFAQ, updateFAQ, getFAQVersions, getFAQVersionSnapshot, rollbackFAQVersion } from '../faq.controller.js';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

function mockReq(overrides: Record<string, any> = {}, defaultBatchId?: string): any {
  return {
    query: {},
    body: {},
    params: {},
    headers: {},
    user: { _id: new Types.ObjectId(), name: 'Test User' },
    programContext: defaultBatchId ? { batchId: defaultBatchId } : { batchId: new Types.ObjectId().toString() },
    ...overrides,
  };
}

function mockRes(): any {
  const body: any = { value: null };
  let statusVal = 200;
  return {
    get statusCode() { return statusVal; },
    get body() { return body; },
    status(this: any, n: number) { statusVal = n; return this; },
    json(this: any, b: unknown) { body.value = b; return this; },
  };
}

describe('FAQ Version History & Rollback System Tests', () => {
  let batchId: string;

  beforeEach(async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('no db');
    await db.collection('yaksha_faq_faqs').deleteMany({});
    await db.collection('yaksha_faq_faq_versions').deleteMany({});
    await db.collection('yaksha_faq_batches').deleteMany({});

    const batch = await Batch.create({
      name: 'Summer Internship 2026',
      description: 'Test batch description',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000),
      isActive: true,
    });
    batchId = batch._id.toString();
  });

  it('creates an initial version snapshot when a new FAQ is created', async () => {
    const req = mockReq({
      body: {
        question: 'What is the stipend amount?',
        answer: 'Stipends are processed monthly.',
        category: 'Finance',
        batchId,
        changeSummary: 'Creating first version',
      },
    }, batchId);
    const res = mockRes();

    await createFAQ(req, res);

    expect(res.statusCode).toBe(201);
    const createdFaq = res.body.value.faq;
    expect(createdFaq).toBeDefined();

    // Check history
    const versions = await FaqVersion.find({ faqId: createdFaq._id });
    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].question).toBe('What is the stipend amount?');
    expect(versions[0].changeSummary).toBe('Creating first version');
  });

  it('automatically backfills Version 1 and creates Version 2 on first edit of a legacy FAQ', async () => {
    // Create an FAQ directly in the database (simulating a legacy FAQ with no history)
    const legacyFaq = await FAQ.create({
      question: 'Legacy Question?',
      answer: 'Legacy Answer.',
      category: 'General',
      batchId: new Types.ObjectId(batchId),
      status: 'approved',
    });

    const req = mockReq({
      params: { id: legacyFaq._id.toString() },
      body: {
        question: 'Legacy Question? Updated!',
        answer: 'Legacy Answer.',
        category: 'General',
        changeSummary: 'First manual edit',
      },
    }, batchId);
    const res = mockRes();

    await updateFAQ(req, res);
    expect(res.statusCode).toBe(200);

    // History should have 2 versions: Version 1 (backfilled) and Version 2 (newly edited)
    const versions = await FaqVersion.find({ faqId: legacyFaq._id }).sort({ versionNumber: 1 });
    expect(versions).toHaveLength(2);

    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].question).toBe('Legacy Question?');
    expect(versions[0].changeSummary).toBe('Initial FAQ creation');

    expect(versions[1].versionNumber).toBe(2);
    expect(versions[1].question).toBe('Legacy Question? Updated!');
    expect(versions[1].changeSummary).toBe('First manual edit');
  });

  it('retrieves versions history correctly', async () => {
    // Create FAQ
    const reqCreate = mockReq({
      body: {
        question: 'FAQ for list testing?',
        answer: 'Answer.',
        category: 'General',
        batchId,
      },
    }, batchId);
    const resCreate = mockRes();
    await createFAQ(reqCreate, resCreate);
    const faqId = resCreate.body.value.faq._id.toString();

    // Edit 1 (moves to Version 2)
    const reqEdit = mockReq({
      params: { id: faqId },
      body: {
        question: 'FAQ for list testing? - Edit 1',
        changeSummary: 'Did edit 1',
      },
    }, batchId);
    const resEdit = mockRes();
    await updateFAQ(reqEdit, resEdit);

    // Get versions
    const reqGet = mockReq({ params: { id: faqId } }, batchId);
    const resGet = mockRes();
    await getFAQVersions(reqGet, resGet);

    expect(resGet.statusCode).toBe(200);
    const versions = resGet.body.value.versions;
    expect(versions).toHaveLength(2);
    expect(versions[0].versionNumber).toBe(2);
    expect(versions[0].changeSummary).toBe('Did edit 1');
    expect(versions[1].versionNumber).toBe(1);
    expect(versions[1].changeSummary).toBe('Initial FAQ creation');
  });

  it('can roll back to a previous version', async () => {
    // Create FAQ (Version 1)
    const reqCreate = mockReq({
      body: {
        question: 'Rollback test question?',
        answer: 'Version 1 Answer.',
        category: 'General',
        batchId,
      },
    }, batchId);
    const resCreate = mockRes();
    await createFAQ(reqCreate, resCreate);
    const faqId = resCreate.body.value.faq._id.toString();

    // Edit FAQ (Version 2)
    const reqEdit = mockReq({
      params: { id: faqId },
      body: {
        answer: 'Version 2 Answer (bad edit).',
        changeSummary: 'Bad edit',
      },
    }, batchId);
    const resEdit = mockRes();
    await updateFAQ(reqEdit, resEdit);

    // Rollback to Version 1 (creates Version 3)
    const reqRollback = mockReq({
      params: { id: faqId, versionNumber: '1' },
      body: { changeSummary: 'Restoring good version' },
    }, batchId);
    const resRollback = mockRes();
    await rollbackFAQVersion(reqRollback, resRollback);

    expect(resRollback.statusCode).toBe(200);

    // Active FAQ should now have Version 1's answer
    const activeFaq = await FAQ.findById(faqId);
    expect(activeFaq?.answer).toBe('Version 1 Answer.');

    // History should now contain 3 versions
    const versions = await FaqVersion.find({ faqId }).sort({ versionNumber: -1 });
    expect(versions).toHaveLength(3);

    // Version 3 (the rollback action itself)
    expect(versions[0].versionNumber).toBe(3);
    expect(versions[0].answer).toBe('Version 1 Answer.');
    expect(versions[0].changeSummary).toBe('Restoring good version');

    // Version 2 (the bad edit before rollback)
    expect(versions[1].versionNumber).toBe(2);
    expect(versions[1].answer).toBe('Version 2 Answer (bad edit).');
  });

  it('caps history at 15 versions to prevent database bloat', async () => {
    // Create FAQ (Version 1)
    const reqCreate = mockReq({
      body: {
        question: 'History Cap Q?',
        answer: 'Ans',
        category: 'General',
        batchId,
      },
    }, batchId);
    const resCreate = mockRes();
    await createFAQ(reqCreate, resCreate);
    const faqId = resCreate.body.value.faq._id.toString();

    // Edit it 16 more times (total 17 versions: Version 1 to 17)
    for (let i = 2; i <= 17; i++) {
      const reqEdit = mockReq({
        params: { id: faqId },
        body: {
          answer: `Ans version ${i}`,
          changeSummary: `Edit ${i}`,
        },
      }, batchId);
      const resEdit = mockRes();
      await updateFAQ(reqEdit, resEdit);
    }

    // Verify history contains exactly 15 versions (versions 3 to 17)
    const versions = await FaqVersion.find({ faqId }).sort({ versionNumber: 1 });
    expect(versions).toHaveLength(15);
    expect(versions[0].versionNumber).toBe(3);
    expect(versions[14].versionNumber).toBe(17);
  });
});

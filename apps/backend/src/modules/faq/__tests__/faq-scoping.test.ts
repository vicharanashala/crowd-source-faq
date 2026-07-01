import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const { default: FAQ } = await import('../faq.model.js');
const { default: Batch } = await import('../../program/batch.model.js');
const { ZoomInsight } = await import('../../zoom/zoom-meeting.model.js');
const { default: DocumentInsight } = await import('../../knowledge/document-insight.model.js');
const { default: CommunityPost } = await import('../../community/community-post.model.js');
const { TranscriptKnowledge } = await import('../../knowledge/transcript-knowledge.model.js');

const { convertInsightToFAQ } = await import('../../zoom/zoom.controller.js');
const { promoteInsightToFaq } = await import('../../../utils/documentPromotion.js');
const { promoteToFAQ } = await import('../../knowledge/knowledge-base.service.js');
const { convertCommunityPostToFAQ } = await import('../../community/post-lifecycle.controller.js');
const { promoteToCommunityApproved } = await import('../../program/promotion.service.js');

function mockReq(overrides: Record<string, unknown> = {}): any {
  return {
    query: {},
    body: {},
    params: {},
    headers: {},
    user: { _id: new Types.ObjectId() },
    programContext: null,
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

async function seedPrograms() {
  const progA = await Batch.create({
    name: 'Program A',
    description: 'A',
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400000),
    isActive: true,
  });
  const progB = await Batch.create({
    name: 'Program B',
    description: 'B',
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400000),
    isActive: true,
  });
  return { progA, progB };
}

describe('FAQ Lifecycle & Program Scoping Integration Tests', () => {
  beforeEach(async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('no db');
    await db.collection('yaksha_faq_faqs').deleteMany({});
    await db.collection('yaksha_faq_batches').deleteMany({});
    await db.collection('zoominsights').deleteMany({});
    await db.collection('yaksha_faq_document_insights').deleteMany({});
    await db.collection('yaksha_faq_communityposts').deleteMany({});
    await db.collection('yaksha_faq_transcriptknowledges').deleteMany({});
  });

  describe('FAQ Promotion Scoping', () => {
    it('convertInsightToFAQ copies batchId from ZoomInsight', async () => {
      const { progA } = await seedPrograms();
      const insight = await ZoomInsight.create({
        meetingId: new Types.ObjectId(),
        type: 'FAQ',
        question: 'What is Zoom scoping?',
        answer_or_content: 'Scoping isolates Zoom data.',
        status: 'approved',
        batchId: progA._id,
        sourcing: 'webhook',
        processedBy: 'ai',
        sourceType: 'zoom_transcript',
      });

      const req = mockReq({ params: { id: insight._id.toString() } });
      const res = mockRes();
      await convertInsightToFAQ(req, res);

      expect(res.statusCode).toBe(200);
      const promotedInsight = await ZoomInsight.findById(insight._id);
      expect(promotedInsight?.publishedFaqId).toBeDefined();

      const faq = await FAQ.findById(promotedInsight?.publishedFaqId);
      expect(faq).toBeDefined();
      expect(faq?.batchId?.toString()).toBe(progA._id.toString());
      expect(faq?.sourceType).toBe('zoom_transcript');
    });

    it('promoteInsightToFaq copies batchId from DocumentInsight', async () => {
      const { progB } = await seedPrograms();
      const insight = await DocumentInsight.create({
        documentId: new Types.ObjectId(),
        type: 'FAQ',
        question: 'What is Document scoping?',
        answer_or_content: 'Scoping isolates document data.',
        status: 'pending_review',
        batchId: progB._id,
        tags: ['doc'],
      });

      const reviewerId = new Types.ObjectId();
      const result = await promoteInsightToFaq(insight, reviewerId, 'admin');

      expect(result.faq).toBeDefined();
      const faq = await FAQ.findById(result.faq?._id);
      expect(faq?.batchId?.toString()).toBe(progB._id.toString());
      expect(faq?.question).toBe(insight.question);
    });

    it('promoteToFAQ copies batchId from TranscriptKnowledge', async () => {
      const { progA } = await seedPrograms();
      const knowledge = await TranscriptKnowledge.create({
        question: 'What is Transcript scoping?',
        answer: 'Scoping isolates transcripts.',
        status: 'approved',
        source: 'manual',
        sourceTitle: 'Manual Ingestion',
        confidence: 0.9,
        batchId: progA._id,
      });

      const creatorId = new Types.ObjectId();
      const faqId = await promoteToFAQ(knowledge._id.toString(), creatorId.toString());

      expect(faqId).toBeDefined();
      const faq = await FAQ.findById(faqId);
      expect(faq?.batchId?.toString()).toBe(progA._id.toString());
    });

    it('convertCommunityPostToFAQ copies batchId from CommunityPost', async () => {
      const { progB } = await seedPrograms();
      const post = await CommunityPost.create({
        title: 'Community FAQ Question',
        body: 'Question body',
        author: new Types.ObjectId(),
        status: 'unanswered',
        batchId: progB._id,
        answer: 'Resolved community answer',
      });

      const req = mockReq({
        params: { id: post._id.toString() },
        programContext: { batchId: progB._id.toString() },
      });
      const res = mockRes();
      await convertCommunityPostToFAQ(req, res);

      expect(res.statusCode).toBe(201);
      const promoted = res.body.value.faq;
      expect(promoted).toBeDefined();
      const faq = await FAQ.findById(promoted._id);
      expect(faq?.batchId?.toString()).toBe(progB._id.toString());
    });

    it('promoteToCommunityApproved copies batchId from CommunityPost in promotion service', async () => {
      const { progA } = await seedPrograms();
      const post = await CommunityPost.create({
        title: 'Auto-promoted Community FAQ',
        body: 'Body',
        author: new Types.ObjectId(),
        status: 'unanswered',
        batchId: progA._id,
        answer: 'Auto answer',
      });

      const faq = await promoteToCommunityApproved(post, new Types.ObjectId().toString());
      expect(faq).toBeDefined();
      expect(faq.batchId?.toString()).toBe(progA._id.toString());
    });
  });

  describe('FAQ Queries & Mutations Scoping Boundaries', () => {
    it('assertSameProgram rejects cross-program detail reads and mutations with 404', async () => {
      const { progA, progB } = await seedPrograms();
      const faq = await FAQ.create({
        question: 'Cross program scoping test?',
        answer: 'Test answer',
        category: 'General',
        status: 'approved',
        batchId: progA._id,
      });

      const { getFAQById, updateFAQ, deleteFAQ } = await import('../faq.controller.js');

      // 1. Read single FAQ with incorrect program context
      const getReq = mockReq({
        params: { id: faq._id.toString() },
        programContext: { batchId: progB._id.toString() },
      });
      const getRes = mockRes();
      await getFAQById(getReq, getRes);
      expect(getRes.statusCode).toBe(404);

      // 2. Update FAQ with incorrect program context
      const updateReq = mockReq({
        params: { id: faq._id.toString() },
        body: { answer: 'Hacked!' },
        programContext: { batchId: progB._id.toString() },
      });
      const updateRes = mockRes();
      await updateFAQ(updateReq, updateRes);
      expect(updateRes.statusCode).toBe(404);

      // 3. Delete FAQ with incorrect program context
      const deleteReq = mockReq({
        params: { id: faq._id.toString() },
        programContext: { batchId: progB._id.toString() },
      });
      const deleteRes = mockRes();
      await deleteFAQ(deleteReq, deleteRes);
      expect(deleteRes.statusCode).toBe(404);

      // Ensure FAQ was not modified or deleted
      const checkFaq = await FAQ.findById(faq._id);
      expect(checkFaq).toBeDefined();
      expect(checkFaq?.answer).toBe('Test answer');
    });
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  getDiceCoefficient,
  getJaroWinklerSimilarity,
  detectDuplicates
} from '../../../utils/ai/duplicateDetector.js';
import FAQ from '../faq.model.js';
import CommunityPost from '../../community/community-post.model.js';
import { checkFAQDuplicate } from '../faq.controller.js';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 240_000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) {
    await mongo.stop();
  }
});

describe('Smart Duplicate Detection Utility', () => {
  describe('Sorensen-Dice Coefficient', () => {
    it('returns 1.0 for identical strings', () => {
      expect(getDiceCoefficient('hello world', 'hello world')).toBe(1.0);
    });

    it('returns 1.0 for strings with case/punctuation differences only', () => {
      expect(getDiceCoefficient('Hello, World!!!', 'hello world')).toBe(1.0);
    });

    it('calculates expected similarity for overlapping bigrams', () => {
      // Bigrams for "night": ni, ig, gh, ht (4 bigrams)
      // Bigrams for "nacht": na, ac, ch, ht (4 bigrams)
      // Intersection: ht (1 bigram)
      // Dice = 2 * 1 / (4 + 4) = 0.25
      expect(getDiceCoefficient('night', 'nacht')).toBe(0.25);
    });

    it('returns 0.0 for completely different strings', () => {
      expect(getDiceCoefficient('abc', 'xyz')).toBe(0.0);
    });
  });

  describe('Jaro-Winkler Similarity', () => {
    it('returns 1.0 for identical strings', () => {
      expect(getJaroWinklerSimilarity('apple', 'apple')).toBe(1.0);
    });

    it('returns 0.0 for completely different strings', () => {
      expect(getJaroWinklerSimilarity('abc', 'xyz')).toBe(0.0);
    });

    it('gives higher similarity for sharing prefixes (Winkler bonus)', () => {
      const score1 = getJaroWinklerSimilarity('dixon', 'dicksonx');
      const score2 = getJaroWinklerSimilarity('martha', 'marhta');
      expect(score2).toBeGreaterThan(0.7);
      expect(score1).toBeGreaterThan(0.5);
    });
  });

  describe('detectDuplicates function', () => {
    beforeEach(async () => {
      await mongoose.connection.db!.collection('yaksha_faq_faqs').deleteMany({});
      await mongoose.connection.db!.collection('yaksha_faq_communityposts').deleteMany({});
    });

    it('finds and ranks similar questions from database', async () => {
      // Seed FAQs
      await FAQ.create([
        {
          question: 'How do I upload a file to the system?',
          answer: 'Go to the uploads tab.',
          category: 'General',
          status: 'approved',
        },
        {
          question: 'Where can I see my profile status?',
          answer: 'Check the profile tab.',
          category: 'Account',
          status: 'approved',
        },
        {
          question: 'Unrelated FAQ question here',
          answer: 'Unrelated answer.',
          category: 'Random',
          status: 'rejected', // Should not be retrieved because status !== approved
        }
      ]);

      // Seed Community Posts
      await CommunityPost.create([
        {
          title: 'Guideline on uploading images and files',
          body: 'File size limit is 5MB.',
          author: new Types.ObjectId(),
          status: 'unanswered',
        },
        {
          title: 'How to register accounts',
          body: 'Register page is at /register.',
          author: new Types.ObjectId(),
          status: 'answered',
        }
      ]);

      // Search query
      const matches = await detectDuplicates('how to upload files?', 0.6);

      expect(matches.length).toBe(2);
      expect(matches[0].question).toContain('upload');
      expect(matches[1].question).toContain('upload');
      expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score);
    });

    it('returns empty array if no matching questions exist above threshold', async () => {
      await FAQ.create({
        question: 'How do I reset my password?',
        answer: 'Click forgot password.',
        category: 'Account',
        status: 'approved',
      });

      const matches = await detectDuplicates('unrelated query about react framework', 0.7);
      expect(matches.length).toBe(0);
    });
  });
});

describe('Smart Duplicate Controller', () => {
  it('validates request body', async () => {
    const req = {
      body: {}
    } as any;

    let responseStatus = 200;
    let responseJson: any = null;

    const res = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseJson = data;
        return this;
      }
    } as any;

    await checkFAQDuplicate(req, res);

    expect(responseStatus).toBe(400);
    expect(responseJson.message).toContain('Question is required');
  });

  it('returns top 3 duplicate matches', async () => {
    // Seed test DB
    await mongoose.connection.db!.collection('yaksha_faq_faqs').deleteMany({});
    await mongoose.connection.db!.collection('yaksha_faq_communityposts').deleteMany({});

    await FAQ.create([
      {
        question: 'how to upload files?',
        answer: 'A1',
        category: 'Cat',
        status: 'approved',
      },
      {
        question: 'how do i upload a file?',
        answer: 'A2',
        category: 'Cat',
        status: 'approved',
      },
      {
        question: 'uploading file guidelines?',
        answer: 'A3',
        category: 'Cat',
        status: 'approved',
      },
      {
        question: 'uploading files instructions?',
        answer: 'A4',
        category: 'Cat',
        status: 'approved',
      }
    ]);

    const req = {
      body: {
        question: 'how to upload file'
      }
    } as any;

    let responseStatus = 200;
    let responseJson: any = null;

    const res = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseJson = data;
        return this;
      }
    } as any;

    await checkFAQDuplicate(req, res);

    expect(responseStatus).toBe(200);
    expect(Array.isArray(responseJson)).toBe(true);
    expect(responseJson.length).toBe(3); // capped at 3
    expect(responseJson[0]).toHaveProperty('id');
    expect(responseJson[0]).toHaveProperty('question');
    expect(responseJson[0]).toHaveProperty('score');
  });
});

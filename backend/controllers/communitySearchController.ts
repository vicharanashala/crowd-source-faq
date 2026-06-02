import mongoose, { Types } from 'mongoose';
import CommunityPost, { ICommunityPost } from '../models/CommunityPost.js';
import { generateEmbedding } from '../utils/embeddings.js';
import { Request, Response } from 'express';
import { computeRRF, applySearchThreshold, type SearchResultItem } from '../utils/search.js';

const COLLECTION_NAME = CommunityPost.collection.name;

async function runTextSearch(queryStr: string, limit = 10): Promise<SearchResultItem[]> {
  try {
    const db = mongoose.connection.db;
    if (!db) return [];
    const collection = db.collection(COLLECTION_NAME);

    return await collection
      .find(
        { $text: { $search: queryStr } },
        {
          projection: {
            score: { $meta: 'textScore' },
            title: 1,
            body: 1,
            author: 1,
            status: 1,
            answer: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        }
      )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .toArray() as SearchResultItem[];
  } catch (error) {
    console.warn(`Text search on '${COLLECTION_NAME}' failed: ${(error as Error).message}`);
    return [];
  }
}

async function runVectorSearch(queryEmbedding: number[], limit = 10): Promise<SearchResultItem[]> {
  try {
    const db = mongoose.connection.db;
    if (!db) return [];
    const collection = db.collection(COLLECTION_NAME);

    return await collection
      .aggregate([
        {
          $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector: queryEmbedding,
            numCandidates: limit * 10,
            limit,
          },
        },
        {
          $project: {
            _id: 1,
            title: 1,
            body: 1,
            author: 1,
            status: 1,
            answer: 1,
            createdAt: 1,
            updatedAt: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ])
      .toArray() as SearchResultItem[];
  } catch (error) {
    console.warn(`Vector search on '${COLLECTION_NAME}' failed: ${(error as Error).message}`);
    return [];
  }
}

export const searchCommunityPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim();

    if (!q) {
      const posts = await CommunityPost.find({})
        .select('-embedding')
        .populate('author', 'name')
        .populate('comments.author', 'name')
        .sort({ createdAt: -1 })
        .limit(30);

      res.json({ results: posts, total: posts.length, query: q });
      return;
    }

    const embedding = await generateEmbedding(q);

    const [vectorResults, textResults] = await Promise.all([
      runVectorSearch(embedding, 10),
      runTextSearch(q, 10),
    ]);

    const merged = computeRRF(vectorResults, textResults);

    const filtered = applySearchThreshold(merged)
      .slice(0, 20);

    const ids = filtered.map((d) => d._id);
    const hydrated = await CommunityPost.find({ _id: { $in: ids } })
      .select('-embedding')
      .populate('author', 'name')
      .populate('comments.author', 'name');

    const hydratedMap = new Map(hydrated.map((doc) => [doc._id.toString(), doc]));

    const results = filtered
      .map((item) => {
        const doc = hydratedMap.get(item._id.toString());
        if (!doc) return null;
        return { ...doc.toObject(), score: item.rrfScore, source: 'community' };
      })
      .filter(Boolean);

    res.json({ results, total: results.length, query: q });
  } catch (error) {
    res.status(500).json({ message: 'Search failed', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};
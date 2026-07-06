import mongoose from 'mongoose';
import { dotProduct } from './categoryClusterer.js';
import { chatWithProvider, resolvePipelineProvider, resolvePipelineModel } from './aiProvider.js';
import { logger } from '../http/logger.js';

const VECTOR_AUTO_MERGE_THRESHOLD = 0.82;
const VECTOR_LLM_VERIFY_THRESHOLD = 0.65;

export interface PostCluster {
  id: string;
  canonicalTitle: string;
  centroid: number[];
  postIds: mongoose.Types.ObjectId[];
  posts: any[];
}

/**
 * Perform a live AI call to verify if two posts are semantically similar.
 */
async function verifySimilarityWithAI(
  post1: { title: string; body?: string },
  post2: { title: string; body?: string }
): Promise<boolean> {
  const provider = resolvePipelineProvider('auto_answer');
  const model = resolvePipelineModel('auto_answer', provider);

  const prompt = [
    'You are an AI assistant helping a community platform group duplicate/similar questions.',
    'Given the titles and bodies of two user posts, determine if they describe the exact same underlying issue, request, or question.',
    'Reply with ONLY "YES" or "NO" (no other text, quotes, or punctuation).',
    '',
    'Post 1:',
    `Title: ${post1.title}`,
    `Body: ${post1.body ?? ''}`,
    '',
    'Post 2:',
    `Title: ${post2.title}`,
    `Body: ${post2.body ?? ''}`,
    '',
    'Are they duplicate questions asking the same thing?',
  ].join('\n');

  console.log(`[postClusterer] AI Similarity Check -> Calling "${provider}" (${model}) for posts: "${post1.title}" and "${post2.title}"`);
  try {
    const reply = await chatWithProvider(
      provider,
      [{ role: 'user', content: prompt }],
      model
    );
    const cleaned = reply.trim().toUpperCase().replace(/[^A-Z]/g, '');
    console.log(`[postClusterer] AI Similarity Result: "${cleaned}"`);
    return cleaned === 'YES';
  } catch (err) {
    logger.warn(`[postClusterer] AI similarity verification failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Generate a canonical title using AI for a cluster of similar posts.
 */
async function generateCanonicalTitle(posts: Array<{ title: string }>): Promise<string> {
  if (posts.length === 1) return posts[0].title;

  const fallback = posts.reduce((prev, current) => {
    // Fallback: use the longest title
    return (current.title || '').length > (prev.title || '').length ? current : prev;
  }, posts[0]).title;

  const provider = resolvePipelineProvider('auto_answer');
  const model = resolvePipelineModel('auto_answer', provider);

  const prompt = [
    'You are an AI assistant helping a community platform group duplicate questions under one clean topic title.',
    'Given a list of similar question titles, suggest ONE clean, concise Title Case title (max 6-8 words) that summarizes them all.',
    'Reply with ONLY the summary title, no quotes, no punctuation.',
    '',
    'Questions:',
    ...posts.map((p) => `- ${p.title}`),
    '',
    'Canonical title:',
  ].join('\n');

  console.log(`[postClusterer] AI Title Gen -> Calling "${provider}" (${model}) to summarize ${posts.length} titles`);
  try {
    const reply = await chatWithProvider(
      provider,
      [{ role: 'user', content: prompt }],
      model
    );
    const cleaned = reply.trim().replace(/[`"']/g, '').trim();
    console.log(`[postClusterer] AI Title Result: "${cleaned}"`);
    if (cleaned.length === 0 || cleaned.length > 150) return fallback;
    return cleaned;
  } catch (err) {
    logger.warn(`[postClusterer] AI title generation failed: ${(err as Error).message}`);
    return fallback;
  }
}

/**
 * Cluster posts by embedding cosine similarity + hybrid AI verification.
 */
export async function clusterPosts(posts: any[]): Promise<PostCluster[]> {
  const clusters: PostCluster[] = [];

  // Filter only posts with embeddings
  const postsWithEmbeddings = posts.filter(p => Array.isArray(p.embedding) && p.embedding.length > 0);
  const postsWithoutEmbeddings = posts.filter(p => !Array.isArray(p.embedding) || p.embedding.length === 0);

  for (const post of postsWithEmbeddings) {
    let bestIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      const score = dotProduct(post.embedding, c.centroid);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    let shouldMerge = false;
    if (bestScore >= VECTOR_AUTO_MERGE_THRESHOLD) {
      shouldMerge = true;
    } else if (bestScore >= VECTOR_LLM_VERIFY_THRESHOLD && bestIdx !== -1) {
      // Borderline match, invoke hybrid AI check
      const representativePost = clusters[bestIdx].posts[0];
      shouldMerge = await verifySimilarityWithAI(post, representativePost);
    }

    if (shouldMerge && bestIdx !== -1) {
      // Merge into the cluster
      const c = clusters[bestIdx];
      c.postIds.push(post._id);
      c.posts.push(post);
      
      // Update centroid
      const newLen = c.posts.length;
      const merged = c.centroid.map((v, i) =>
        (v * (newLen - 1) + post.embedding[i]) / newLen
      );
      // l2Normalize helper
      let norm = 0;
      for (const x of merged) norm += x * x;
      norm = Math.sqrt(norm);
      c.centroid = norm < 1e-9 ? merged : merged.map((x) => x / norm);
    } else {
      // Create new cluster
      clusters.push({
        id: new mongoose.Types.ObjectId().toString(),
        canonicalTitle: post.title,
        centroid: [...post.embedding],
        postIds: [post._id],
        posts: [post],
      });
    }
  }

  // Generate canonical titles using AI for groups of 2 or more
  for (const c of clusters) {
    if (c.posts.length > 1) {
      c.canonicalTitle = await generateCanonicalTitle(c.posts);
    }
  }

  // Add back posts without embeddings as single clusters
  for (const post of postsWithoutEmbeddings) {
    clusters.push({
      id: new mongoose.Types.ObjectId().toString(),
      canonicalTitle: post.title,
      centroid: [],
      postIds: [post._id],
      posts: [post],
    });
  }

  return clusters;
}

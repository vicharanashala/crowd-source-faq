import { Request, Response } from 'express';
import { Types } from 'mongoose';
import FAQ from '../models/FAQ.js';
import CommunityPost from '../models/CommunityPost.js';
import DocumentRecord from '../models/DocumentRecord.js';
import SearchLog from '../models/SearchLog.js';
import UnresolvedSearch from '../models/UnresolvedSearch.js';
import ProgramEnrollment from '../models/ProgramEnrollment.js';

export const getRecommendations = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const userId = (req.user as any)._id;

    // 1. Resolve batchId (either from query or user's active enrollments)
    let batchIdStr = req.query.batchId as string;
    let batchId: Types.ObjectId | null = null;

    if (batchIdStr && Types.ObjectId.isValid(batchIdStr)) {
      batchId = new Types.ObjectId(batchIdStr);
    } else {
      // Find user's active enrollments
      const enrollment = await ProgramEnrollment.findOne({ userId, isActive: true })
        .sort({ enrolledAt: -1 })
        .lean();
      if (enrollment && enrollment.batchId) {
        batchId = enrollment.batchId as Types.ObjectId;
      }
    }

    // 2. Fetch user's recent search terms
    const recentSearches = await SearchLog.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 3. Fetch user's unresolved searches (where feedback was provided or status is pending)
    const unresolvedSearches = await UnresolvedSearch.find({ userId, status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 4. Fetch user's unresolved community posts (unanswered doubts)
    const unresolvedDoubts = await CommunityPost.find({ author: userId, status: 'unanswered' })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 5. Compute weak categories / focus tags
    const focusTags = new Set<string>();
    const weakCategories = new Set<string>();

    // Collect tags from unresolved community doubts
    unresolvedDoubts.forEach(post => {
      if (post.tags) {
        post.tags.forEach(tag => focusTags.add(tag.toLowerCase()));
      }
    });

    // Extract terms from recent searches to see if they match FAQs / tags
    const searchTerms: string[] = [];
    recentSearches.forEach(log => {
      if (log.query) {
        const phrase = log.query.trim().toLowerCase();
        if (phrase.length > 2) {
          searchTerms.push(phrase);
        }
      }
    });

    unresolvedSearches.forEach(unr => {
      if (unr.query) {
        const phrase = unr.query.trim().toLowerCase();
        if (phrase.length > 2) {
          searchTerms.push(phrase);
        }
      }
    });

    // 6. Find FAQs matching our focus tags, search terms, or weak categories
    const faqQuery: any = { status: 'approved' };
    if (batchId) {
      faqQuery.batchId = batchId;
    }

    // Match conditions
    const orConditions: any[] = [];
    if (focusTags.size > 0) {
      orConditions.push({ tags: { $in: Array.from(focusTags) } });
    }
    if (searchTerms.length > 0) {
      searchTerms.forEach(term => {
        orConditions.push({ question: { $regex: term, $options: 'i' } });
        orConditions.push({ tags: { $in: [term] } });
      });
    }

    let recommendedFAQs: any[] = [];
    if (orConditions.length > 0) {
      faqQuery.$or = orConditions;
      recommendedFAQs = await FAQ.find(faqQuery)
        .limit(3)
        .lean();
    }

    // If we didn't find enough custom recommendations, fall back to popular FAQs
    if (recommendedFAQs.length < 3) {
      const excludeIds = recommendedFAQs.map(f => f._id);
      const fallbackQuery: any = {
        status: 'approved',
        _id: { $nin: excludeIds }
      };
      if (batchId) {
        fallbackQuery.batchId = batchId;
      }

      const popularFAQs = await FAQ.find(fallbackQuery)
        .sort({ views: -1, helpfulVotes: -1 })
        .limit(3 - recommendedFAQs.length)
        .lean();

      recommendedFAQs.push(...popularFAQs);
    }

    // Derive weak categories from the recommended FAQs or existing logs
    recommendedFAQs.forEach(faq => {
      if (faq.category) {
        weakCategories.add(faq.category);
      }
    });

    // If no weak categories could be found, return a default list or popular categories
    if (weakCategories.size === 0) {
      const categoryAgg = await FAQ.aggregate([
        { $match: batchId ? { batchId, status: 'approved' } : { status: 'approved' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 3 }
      ]);
      categoryAgg.forEach(c => {
        if (c._id) weakCategories.add(c._id);
      });
    }

    // 7. Find Resources (DocumentRecord) that match focus tags or weak categories
    const docQuery: any = {};
    const docOrConditions: any[] = [];
    weakCategories.forEach(cat => {
      docOrConditions.push({ title: { $regex: cat, $options: 'i' } });
    });
    focusTags.forEach(tag => {
      docOrConditions.push({ title: { $regex: tag, $options: 'i' } });
    });

    let recommendedResources: any[] = [];
    if (docOrConditions.length > 0) {
      docQuery.$or = docOrConditions;
      recommendedResources = await DocumentRecord.find(docQuery)
        .limit(3)
        .lean();
    }

    // Fallback resources if not enough matching ones
    if (recommendedResources.length < 3) {
      const excludeIds = recommendedResources.map(r => r._id);
      const popularResources = await DocumentRecord.find({
        _id: { $nin: excludeIds },
        status: 'completed'
      })
        .sort({ createdAt: -1 })
        .limit(3 - recommendedResources.length)
        .lean();

      recommendedResources.push(...popularResources);
    }

    // Return aggregated mentor object
    res.json({
      recommendations: {
        weakCategories: Array.from(weakCategories),
        focusTopics: Array.from(focusTags),
        faqs: recommendedFAQs,
        resources: recommendedResources.map(r => ({
          _id: r._id,
          title: r.title,
          fileName: r.fileName,
          fileType: r.fileType,
          fileSize: r.fileSize,
          createdAt: r.createdAt
        }))
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};

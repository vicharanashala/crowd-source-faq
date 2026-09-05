import { Request, Response } from 'express';
import { logger } from '../../utils/http/logger.js';
import Batch from '../program/batch.model.js';
import { IFAQ } from '../faq/faq.model.js';
import mongoose from 'mongoose';

// Import FAQ model dynamically to avoid circular dependencies
let FAQ: mongoose.Model<IFAQ>;
try {
  const faqModule = await import('../faq/faq.model.js');
  FAQ = faqModule.default || faqModule.FAQ;
} catch (error) {
  logger.warn('FAQ model not found');
}

export class EmbedController {
  /**
   * GET /csfaq/api/embed/faqs
   * Returns FAQs in JSON format for embedding
   */
  async getFaqs(req: Request, res: Response) {
    try {
      const { batchId, limit = '10', category } = req.query;
      
      if (!FAQ) {
        return res.status(503).json({
          success: false,
          message: 'FAQ service unavailable'
        });
      }
      
      // Build query based on actual FAQ model fields
      const query: any = {
        status: 'approved', // FAQ model uses 'approved' status
        deletedAt: null // Exclude soft-deleted FAQs
      };
      
      if (batchId) {
        query.batchId = new mongoose.Types.ObjectId(batchId as string);
      }
      
      if (category) {
        query.category = category;
      }
      
      const faqs = await FAQ.find(query)
        .limit(Math.min(parseInt(limit as string, 10), 50))
        .select('question answer category tags createdAt updatedAt popularityScore')
        .sort({ popularityScore: -1, helpfulVotes: -1 })
        .lean()
        .exec();
        
      res.json({
        success: true,
        data: faqs,
        meta: {
          count: faqs.length,
          batchId: batchId || 'all',
          limit: parseInt(limit as string, 10)
        }
      });
    } catch (error) {
      logger.error('Embed FAQ fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch FAQs for embedding'
      });
    }
  }

  /**
   * GET /csfaq/api/embed/config
   * Returns configuration for the widget
   */
  async getConfig(req: Request, res: Response) {
    try {
      const { batchId } = req.query;
      
      if (batchId) {
        const batch = await Batch.findById(batchId).select('name description slug');
        res.json({
          success: true,
          data: batch || { title: 'Frequently Asked Questions' }
        });
      } else {
        res.json({
          success: true,
          data: {
            title: 'Frequently Asked Questions',
            theme: 'light',
            defaultLimit: 10
          }
        });
      }
    } catch (error) {
      logger.error('Embed config error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch embed configuration'
      });
    }
  }
}
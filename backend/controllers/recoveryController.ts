import { Request, Response } from 'express';
import { ZoomMeeting, ZoomInsight } from '../models/ZoomMeeting.js';

export const getLatestRecovery = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = req.programContext?.batchId;
    const filter: Record<string, any> = { status: 'completed' };
    if (batchId) {
      filter.batchId = batchId;
    }

    const latestMeeting = await ZoomMeeting.findOne(filter).sort({ startTime: -1 });
    if (!latestMeeting) {
      res.status(404).json({ message: 'No completed session found for this program.' });
      return;
    }

    const insights = await ZoomInsight.find({
      meetingId: latestMeeting._id,
      status: 'approved',
    });

    const announcements = insights.filter(i => i.type === 'Announcement').map(i => i.answer_or_content);
    const faqs = insights.filter(i => i.type === 'FAQ').map(i => ({
      question: i.question,
      answer: i.answer_or_content
    }));

    // If summary/revisionNotes are empty/undefined, fall back to structured summary of Zoom insights
    let summary = latestMeeting.summary;
    let revisionNotes = latestMeeting.revisionNotes;

    if (!summary) {
      if (announcements.length > 0 || faqs.length > 0) {
        summary = `Here is a summary of the session: we covered key announcements and answered several important student questions.`;
      } else {
        summary = `This session has been completed, but no summary or insights were extracted yet.`;
      }
    }

    if (!revisionNotes) {
      if (faqs.length > 0) {
        revisionNotes = `Key Takeaways:\n` + faqs.map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`).join('\n\n');
      } else {
        revisionNotes = `Takeaways: No Q&A or key points were extracted from this session. Please review the raw recording or materials.`;
      }
    }

    res.json({
      meetingId: latestMeeting._id,
      topic: latestMeeting.topic,
      startTime: latestMeeting.startTime,
      duration: latestMeeting.duration,
      summary,
      revisionNotes,
      announcements,
      faqs,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve latest recovery data.', error: (error as Error).message });
  }
};

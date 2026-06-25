import { Request, Response } from 'express';
import Project from '../models/Project.js';
import Orientation from '../models/Orientation.js';
import AiQuestion from '../models/AiQuestion.js';
// @ts-ignore — openai v6+ ships its own .d.ts; resolution depends on moduleResolution setting
import OpenAI from 'openai';

// Fetch the most recent orientation video
export const getActiveOrientation = async (req: Request, res: Response): Promise<void> => {
  try {
    const orientation = await Orientation.findOne().sort({ createdAt: -1 });
    res.status(200).json(orientation);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching orientation', error });
  }
};

// Fetch all active projects for the timeline and selection modal
export const getTimelineProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const projects = await Project.find({ status: 'active' }).populate('mentor').sort({ createdAt: -1 }).lean();
    
    const User = (await import('../models/User.js')).default;
    const projectCounts = await User.aggregate([
      { $match: { projectAssigned: { $exists: true, $ne: '' } } },
      { $group: { _id: '$projectAssigned', count: { $sum: 1 } } }
    ]);
    const countMap = projectCounts.reduce((acc: any, curr: any) => ({ ...acc, [curr._id]: curr.count }), {});

    const projectsWithCounts = projects.map((p: any) => ({
      ...p,
      capacity: p.capacity ?? 30,
      selectedCount: countMap[p.projectName] || 0
    }));

    res.status(200).json(projectsWithCounts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching projects', error });
  }
};

// Ask a question to the AI
export const askOrientationQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orientationId, question } = req.body;
    const userId = (req as any).user?._id; // Assuming auth middleware sets req.user

    if (!orientationId || !question) {
      res.status(400).json({ message: 'orientationId and question are required' });
      return;
    }

    const orientation = await Orientation.findById(orientationId);
    if (!orientation) {
      res.status(404).json({ message: 'Orientation not found' });
      return;
    }

    // Prepare API client
    const apiKey = process.env.GROK_API_KEY || process.env.GROQ_API_KEY;
    console.log("GROK/GROQ loaded:", !!apiKey);
    
    // Check if it's a Groq key (starts with gsk_) to correctly route the request
    const isGroq = apiKey?.startsWith('gsk_');
    const baseURL = isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.x.ai/v1';
    const aiModel = isGroq ? 'llama-3.1-8b-instant' : 'grok-beta';

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
    });

    const prompt = `You are an AI assistant for a new orientation. 
Use the following transcript to answer the user's question. 
If the answer is not in the transcript, clearly state that the information was not covered in the orientation.

Transcript:
"""
${orientation.transcript}
"""

User Question: ${question}
`;

    const response = await openai.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'system', content: prompt }],
    });

    const answer = response.choices[0]?.message?.content || 'Sorry, I could not generate an answer.';

    // Store the question and answer
    if (userId) {
      await AiQuestion.create({ userId, orientationId, question, answer });
    }

    res.status(200).json({ answer });
  } catch (error) {
    console.error('Error asking AI question:', error);
    res.status(500).json({ message: 'Error generating answer', error });
  }
};

export const trackWelcomeOnboarding = async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeSpent } = req.body;
    // @ts-ignore
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    if (timeSpent >= 60) {
      const User = (await import('../models/User.js')).default;
      await User.findByIdAndUpdate(userId, { welcomePackageOnboarded: true });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error tracking welcome onboarding:', error);
    res.status(500).json({ message: 'Error tracking welcome onboarding', error });
  }
};

export const completeOrientation = async (req: Request, res: Response): Promise<void> => {
  try {
    // @ts-ignore
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const User = (await import('../models/User.js')).default;
    await User.findByIdAndUpdate(userId, { orientationCompleted: true });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error completing orientation:', error);
    res.status(500).json({ message: 'Error completing orientation', error });
  }
};

export const selectProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { project } = req.body;
    // @ts-ignore
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    if (!project) {
      res.status(400).json({ message: 'Project is required' });
      return;
    }

    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (user.projectSelectionLocked) {
      res.status(400).json({ message: 'Project selection is already locked' });
      return;
    }

    const projectDoc = await Project.findOne({ projectName: project, status: 'active' }).populate('mentor');
    if (!projectDoc) {
      res.status(400).json({ message: 'Invalid or inactive project selection' });
      return;
    }

    const currentCount = await User.countDocuments({ projectAssigned: projectDoc.projectName });
    if (currentCount >= projectDoc.capacity) {
      res.status(400).json({ message: 'This project has reached its maximum capacity.' });
      return;
    }

    user.projectAssigned = projectDoc.projectName;
    user.mentorAssigned = projectDoc.mentor ? (projectDoc.mentor as any).name : projectDoc.mentorName;
    user.projectSelectionLocked = true;
    user.projectAssignedAt = new Date();
    user.projectAssignedBy = 'system';

    await user.save();

    res.status(200).json({ 
      success: true, 
      project: user.projectAssigned,
      mentor: user.mentorAssigned
    });
  } catch (error) {
    console.error('Error selecting project:', error);
    res.status(500).json({ message: 'Error selecting project', error });
  }
};

export const getMyProject = async (req: Request, res: Response): Promise<void> => {
  try {
    // @ts-ignore
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);

    if (!user || !user.projectAssigned) {
      res.status(404).json({ message: 'No project assigned' });
      return;
    }

    const project = await Project.findOne({ projectName: user.projectAssigned }).populate('mentor').lean();
    
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    res.status(200).json(project);
  } catch (error) {
    console.error('Error fetching my project:', error);
    res.status(500).json({ message: 'Error fetching my project', error });
  }
};

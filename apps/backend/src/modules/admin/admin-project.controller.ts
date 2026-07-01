import { Request, Response } from 'express';
import Project from './project.model.js';

export const getProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const projects = await Project.find({ status: { $ne: 'archived' } }).sort({ createdAt: -1 });
    res.status(200).json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching projects', error });
  }
};

export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      projectName, description, mentorName, mentorEmail, mentor, status, resources, skills,
      problemStatement, whyMatters, outcomes, difficulty, weeklyCommitment, techStack, deliverables, teamSize, capacity
    } = req.body;
    
    if (!projectName || (!mentorName && !mentor)) {
      res.status(400).json({ message: 'Project name and a mentor are required' });
      return;
    }

    const newProject = new Project({
      projectName,
      description: description || '',
      mentorName,
      mentorEmail,
      mentor,
      status: status || 'active',
      resources: resources || [],
      skills: skills || [],
      problemStatement,
      whyMatters,
      outcomes,
      difficulty,
      weeklyCommitment,
      techStack: techStack || [],
      deliverables: deliverables || [],
      teamSize,
      capacity: capacity !== undefined ? capacity : 30
    });

    await newProject.save();
    res.status(201).json(newProject);
  } catch (error) {
    res.status(500).json({ message: 'Error creating project', error });
  }
};

export const updateProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { 
      projectName, description, mentorName, mentorEmail, mentor, status, resources, skills,
      problemStatement, whyMatters, outcomes, difficulty, weeklyCommitment, techStack, deliverables, teamSize, capacity
    } = req.body;

    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (projectName !== undefined) project.projectName = projectName;
    if (description !== undefined) project.description = description;
    if (mentorName !== undefined) project.mentorName = mentorName;
    if (mentorEmail !== undefined) project.mentorEmail = mentorEmail;
    if (mentor !== undefined) project.mentor = mentor;
    if (status !== undefined) project.status = status;
    if (resources !== undefined) project.resources = resources;
    if (skills !== undefined) project.skills = skills;
    if (problemStatement !== undefined) project.problemStatement = problemStatement;
    if (whyMatters !== undefined) project.whyMatters = whyMatters;
    if (outcomes !== undefined) project.outcomes = outcomes;
    if (difficulty !== undefined) project.difficulty = difficulty;
    if (weeklyCommitment !== undefined) project.weeklyCommitment = weeklyCommitment;
    if (techStack !== undefined) project.techStack = techStack;
    if (deliverables !== undefined) project.deliverables = deliverables;
    if (teamSize !== undefined) project.teamSize = teamSize;
    if (capacity !== undefined) project.capacity = capacity;

    await project.save();
    res.status(200).json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error updating project', error });
  }
};

export const archiveProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);
    
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    project.status = 'archived';
    await project.save();
    
    res.status(200).json({ message: 'Project archived successfully', project });
  } catch (error) {
    res.status(500).json({ message: 'Error archiving project', error });
  }
};

import express from 'express';
import { getProjects, createProject, updateProject, archiveProject } from './admin-project.controller.js';

const router = express.Router();

router.get('/', getProjects);
router.post('/', createProject);
router.put('/:id', updateProject);
router.put('/:id/archive', archiveProject);

export default router;

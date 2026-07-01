import express from 'express';
import { getMentors, getAllMentors, createMentor, updateMentor, archiveMentor } from './admin-mentor.controller.js';
import { protect } from '../../middleware/auth.js';
import { adminOnly } from '../../middleware/admin.js';

const router = express.Router();

router.use(protect);
router.use(adminOnly);

router.get('/', getMentors);
router.get('/all', getAllMentors);
router.post('/', createMentor);
router.put('/:id', updateMentor);
router.put('/:id/archive', archiveMentor);

export default router;

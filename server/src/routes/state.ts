import { Router } from 'express';
import { getStudentState } from '../db';

const router = Router();

router.get('/:studentId', (req, res) => {
  const state = getStudentState(req.params.studentId);
  res.json(state);
});

export default router;
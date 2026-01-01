import { Router } from 'express';
import { submitGradeAppeal, getStudentGradeAppeals } from '../../controllers/appeal.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';

const router = Router();

router.use(authenticate);

router.post(
  '/students/results/appeal',
  authorizeRoles('student'),
  submitGradeAppeal
);

router.get(
  '/students/results/appeals',
  authorizeRoles('student'),
  getStudentGradeAppeals
);

export default router;

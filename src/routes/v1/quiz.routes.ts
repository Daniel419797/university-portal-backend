import { Router } from 'express';
import {
  createQuiz,
  getQuizzes,
  getQuizById,
  updateQuiz,
  deleteQuiz,
  startQuiz,
  submitQuiz,
  getQuizAttempts,
  getMyQuizAttempt,
} from '../../controllers/quiz.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import { USER_ROLES } from '../../utils/constants';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Quiz routes
router
  .route('/')
  .get(getQuizzes)
  .post(authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.ADMIN), createQuiz);

router
  .route('/:id')
  .get(getQuizById)
  .put(authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.ADMIN), updateQuiz)
  .delete(authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.ADMIN), deleteQuiz);

// Quiz attempt routes
router.post('/:id/start', authorizeRoles(USER_ROLES.STUDENT), startQuiz);
router.post('/:id/submit', authorizeRoles(USER_ROLES.STUDENT), submitQuiz);
router.get('/:id/my-attempt', authorizeRoles(USER_ROLES.STUDENT), getMyQuizAttempt);

router.get(
  '/:id/attempts',
  authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.ADMIN),
  getQuizAttempts
);

export default router;

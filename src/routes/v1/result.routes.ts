import { Router } from 'express';
import {
  createResult,
  getResults,
  getResultById,
  updateResult,
  deleteResult,
  approveResultByHOD,
  approveResultByAdmin,
  publishResults,
  getTranscript,
  getResultsSummary,
} from '../../controllers/result.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import { USER_ROLES } from '../../utils/constants';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Result management routes
router
  .route('/')
  .get(getResults)
  .post(authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.ADMIN), createResult);

router.put(
  '/publish',
  authorizeRoles(USER_ROLES.ADMIN),
  publishResults
);

router
  .route('/:id')
  .get(getResultById)
  .put(authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.ADMIN), updateResult)
  .delete(authorizeRoles(USER_ROLES.ADMIN), deleteResult);

// Approval routes
router.put(
  '/:id/approve-hod',
  authorizeRoles(USER_ROLES.HOD),
  approveResultByHOD
);

router.put(
  '/:id/approve-admin',
  authorizeRoles(USER_ROLES.ADMIN),
  approveResultByAdmin
);

// Transcript and summary routes
router.get('/transcript/:studentId', getTranscript);
router.get('/summary/:studentId', getResultsSummary);

export default router;

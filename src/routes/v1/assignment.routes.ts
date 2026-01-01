import { Router } from 'express';
import {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  getAssignmentSubmissions,
  gradeSubmission,
} from '../../controllers/assignment.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import { uploadDocuments, uploadSubmission } from '../../middleware/upload.middleware';
import { USER_ROLES } from '../../utils/constants';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Assignment routes
router
  .route('/')
  .get(getAssignments)
  .post(
    authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.ADMIN),
    uploadDocuments,
    createAssignment
  );

router
  .route('/:id')
  .get(getAssignmentById)
  .put(authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.ADMIN), updateAssignment)
  .delete(authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.ADMIN), deleteAssignment);

// Submission routes
router.post(
  '/:id/submit',
  authorizeRoles(USER_ROLES.STUDENT),
  uploadSubmission,
  submitAssignment
);

router.get(
  '/:id/submissions',
  authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.ADMIN),
  getAssignmentSubmissions
);

router.put(
  '/:assignmentId/submissions/:submissionId/grade',
  authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.ADMIN),
  gradeSubmission
);

export default router;

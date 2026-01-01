import { Router } from 'express';
import {
  getStudentClearance,
  requestClearanceDocument,
  getAllClearanceRequests,
  getClearanceDetails,
  updateDepartmentStatus,
  approveClearance,
  rejectClearance
} from '../../controllers/clearance.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';

const router = Router();

// Student routes
router.get(
  '/students/clearance',
  authenticate,
  authorizeRoles('student'),
  getStudentClearance
);

router.post(
  '/students/clearance/documents/request',
  authenticate,
  authorizeRoles('student'),
  requestClearanceDocument
);

// Admin routes
router.get(
  '/admin/clearance',
  authenticate,
  authorizeRoles('admin'),
  getAllClearanceRequests
);

router.get(
  '/admin/clearance/:id',
  authenticate,
  authorizeRoles('admin'),
  getClearanceDetails
);

router.post(
  '/admin/clearance/:id/departments',
  authenticate,
  authorizeRoles('admin'),
  updateDepartmentStatus
);

router.post(
  '/admin/clearance/:id/approve',
  authenticate,
  authorizeRoles('admin'),
  approveClearance
);

router.post(
  '/admin/clearance/:id/reject',
  authenticate,
  authorizeRoles('admin'),
  rejectClearance
);

export default router;

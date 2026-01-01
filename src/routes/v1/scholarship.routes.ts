import { Router } from 'express';
import {
  getAvailableScholarships,
  applyForScholarship,
  getStudentApplications,
  getAllApplications,
  getApplicationDetails,
  approveApplication,
  rejectApplication,
  createScholarship
} from '../../controllers/scholarship.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';

const router = Router();

// Student routes
router.get(
  '/students/scholarships',
  authenticate,
  authorizeRoles('student'),
  getAvailableScholarships
);

router.post(
  '/students/scholarships/apply',
  authenticate,
  authorizeRoles('student'),
  applyForScholarship
);

router.get(
  '/students/scholarships/applications',
  authenticate,
  authorizeRoles('student'),
  getStudentApplications
);

// Bursary routes
router.get(
  '/bursary/scholarships',
  authenticate,
  authorizeRoles('bursary', 'admin'),
  getAllApplications
);

router.post(
  '/bursary/scholarships/create',
  authenticate,
  authorizeRoles('bursary', 'admin'),
  createScholarship
);

router.get(
  '/bursary/scholarships/:id',
  authenticate,
  authorizeRoles('bursary', 'admin'),
  getApplicationDetails
);

router.post(
  '/bursary/scholarships/:id/approve',
  authenticate,
  authorizeRoles('bursary', 'admin'),
  approveApplication
);

router.post(
  '/bursary/scholarships/:id/reject',
  authenticate,
  authorizeRoles('bursary', 'admin'),
  rejectApplication
);

export default router;

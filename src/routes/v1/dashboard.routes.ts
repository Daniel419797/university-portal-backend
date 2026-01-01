import { Router } from 'express';
import {
  getStudentDashboard,
  getLecturerDashboard,
  getHODDashboard,
  getBursaryDashboard,
  getAdminDashboard
} from '../../controllers/dashboard.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';

const router = Router();

// Student dashboard
router.get('/students/dashboard', authenticate, authorizeRoles('student'), getStudentDashboard);

// Lecturer dashboard
router.get('/lecturers/dashboard', authenticate, authorizeRoles('lecturer'), getLecturerDashboard);

// HOD dashboard
router.get('/hod/dashboard', authenticate, authorizeRoles('hod'), getHODDashboard);

// Bursary dashboard
router.get('/bursary/dashboard', authenticate, authorizeRoles('bursary'), getBursaryDashboard);

// Admin dashboard
router.get('/admin/dashboard', authenticate, authorizeRoles('admin'), getAdminDashboard);

export default router;

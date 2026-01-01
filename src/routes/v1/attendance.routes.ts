import { Router } from 'express';
import {
  getStudentAttendance,
  getLecturerAttendance,
  recordAttendance,
  getAttendanceHistory,
  updateAttendance,
  deleteAttendance
} from '../../controllers/attendance.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';

const router = Router();

// Student routes
router.get(
  '/students/attendance',
  authenticate,
  authorizeRoles('student'),
  getStudentAttendance
);

// Lecturer routes
router.get(
  '/lecturers/attendance',
  authenticate,
  authorizeRoles('lecturer'),
  getLecturerAttendance
);

router.post(
  '/lecturers/attendance',
  authenticate,
  authorizeRoles('lecturer'),
  recordAttendance
);

router.get(
  '/lecturers/attendance/history',
  authenticate,
  authorizeRoles('lecturer'),
  getAttendanceHistory
);

router.put(
  '/lecturers/attendance/:id',
  authenticate,
  authorizeRoles('lecturer'),
  updateAttendance
);

router.delete(
  '/lecturers/attendance/:id',
  authenticate,
  authorizeRoles('lecturer'),
  deleteAttendance
);

export default router;

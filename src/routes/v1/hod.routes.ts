import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import {
  assignCoursesToStaff,
  getHodAnalytics,
  getHodDepartmentProfile,
  getHodDepartmentStatistics,
  getHodPendingResults,
  getHodResultDetail,
  getHodStaff,
  getHodStaffProfile,
  getHodStudentProfile,
  getHodStudents,
  updateHodDepartmentProfile,
} from '../../controllers/hod.controller';
import { approveResultByHOD, rejectResultByHOD } from '../../controllers/result.controller';

const router = Router();

router.use(authenticate, authorizeRoles('hod'));

router.get('/students', getHodStudents);
router.get('/students/:id', getHodStudentProfile);
router.get('/staff', getHodStaff);
router.get('/staff/:id', getHodStaffProfile);
router.post('/staff/:id/assign-courses', assignCoursesToStaff);
router.get('/department', getHodDepartmentProfile);
router.put('/department', updateHodDepartmentProfile);
router.get('/department/statistics', getHodDepartmentStatistics);
router.get('/results/pending-approval', getHodPendingResults);
router.get('/results/:id', getHodResultDetail);
router.post('/results/:id/approve', approveResultByHOD);
router.post('/results/:id/reject', rejectResultByHOD);
router.get('/analytics', getHodAnalytics);

export default router;

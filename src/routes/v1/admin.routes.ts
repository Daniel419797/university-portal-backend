import { Router } from 'express';
import {
  assignHostelRoom,
  bulkUploadUsers,
  createAnnouncement,
  deleteAnnouncement,
  evictStudentFromRoom,
  generateInvoice,
  getAdminAnalytics,
  getAdminSettings,
  getAnnouncements,
  getFinancialAnalytics,
  getFinancialOverview,
  getFinancialReports,
  getHostelRoomDetails,
  sendFinancialReminder,
  updateAdminSettings,
  updateAnnouncement,
  updateHostelRoom,
} from '../../controllers/admin.controller';
import {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
} from '../../controllers/user.controller';
import { register } from '../../controllers/auth.controller';
import {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
} from '../../controllers/course.controller';
import {
  createHostel,
  getHostels,
  getHostelById,
  getHostelApplications,
  getHostelApplicationById,
  approveHostelApplication,
  rejectHostelApplication,
} from '../../controllers/hostel.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import { uploadCsv } from '../../middleware/upload.middleware';
import { USER_ROLES } from '../../utils/constants';

const router = Router();

router.use(authenticate, authorizeRoles(USER_ROLES.ADMIN));

router.post('/users/bulk-upload', uploadCsv, bulkUploadUsers);
router
  .route('/users')
  .get(getUsers)
  .post(register);

router
  .route('/users/:id')
  .get(getUserById)
  .put(updateUser)
  .delete(deleteUser);

router
  .route('/hostel/:hostelId/rooms/:roomNumber')
  .get(getHostelRoomDetails)
  .put(updateHostelRoom);

router.post('/hostel/:hostelId/rooms/:roomNumber/assign', assignHostelRoom);
router.post('/hostel/:hostelId/rooms/:roomNumber/evict', evictStudentFromRoom);

router
  .route('/courses')
  .get(listCourses)
  .post(createCourse);

router
  .route('/courses/:id')
  .get(getCourse)
  .put(updateCourse)
  .delete(deleteCourse);

router
  .route('/hostel')
  .get(getHostels)
  .post(createHostel);

router.get('/hostel/:id', getHostelById);
router.get('/hostel/applications', getHostelApplications);
router.get('/hostel/applications/:id', getHostelApplicationById);
router.post('/hostel/applications/:id/approve', approveHostelApplication);
router.post('/hostel/applications/:id/reject', rejectHostelApplication);

router
  .route('/announcements')
  .get(getAnnouncements)
  .post(createAnnouncement);

router
  .route('/announcements/:id')
  .put(updateAnnouncement)
  .delete(deleteAnnouncement);

router.get('/financial', getFinancialOverview);
router.post('/financial/generate-invoice', generateInvoice);
router.post('/financial/send-reminder', sendFinancialReminder);
router.get('/financial/reports', getFinancialReports);
router.get('/financial/analytics', getFinancialAnalytics);

router.get('/analytics', getAdminAnalytics);

router
  .route('/settings')
  .get(getAdminSettings)
  .put(updateAdminSettings);

export default router;

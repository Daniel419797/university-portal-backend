import { Router } from 'express';
import {
  createHostel,
  getHostels,
  getHostelById,
  updateHostel,
  deleteHostel,
  applyForHostel,
  getHostelApplications,
  getHostelApplicationById,
  approveHostelApplication,
  rejectHostelApplication,
  allocateRoom,
  getHostelStats,
} from '../../controllers/hostel.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import { USER_ROLES } from '../../utils/constants';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Hostel management routes
router
  .route('/')
  .get(getHostels)
  .post(authorizeRoles(USER_ROLES.ADMIN), createHostel);

router
  .route('/:id')
  .get(getHostelById)
  .put(authorizeRoles(USER_ROLES.ADMIN), updateHostel)
  .delete(authorizeRoles(USER_ROLES.ADMIN), deleteHostel);

// Hostel application routes
router.post('/apply', authorizeRoles(USER_ROLES.STUDENT), applyForHostel);

router.get('/applications', getHostelApplications);
router.get('/applications/:id', getHostelApplicationById);

router.put(
  '/applications/:id/approve',
  authorizeRoles(USER_ROLES.ADMIN),
  approveHostelApplication
);

router.put(
  '/applications/:id/reject',
  authorizeRoles(USER_ROLES.ADMIN),
  rejectHostelApplication
);

router.put(
  '/applications/:id/allocate',
  authorizeRoles(USER_ROLES.ADMIN),
  allocateRoom
);

// Statistics
router.get(
  '/stats/overview',
  authorizeRoles(USER_ROLES.ADMIN),
  getHostelStats
);

export default router;

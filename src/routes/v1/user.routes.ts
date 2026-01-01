import { Router } from 'express';
import {
  getUsers,
  getUserById,
  updateUser,
  updateAvatar,
  changePassword,
  deleteUser,
  activateUser,
  updateUserRole,
  getUserStats,
  getStudentsByDepartment,
  searchUsers,
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  deactivateMyAccount,
} from '../../controllers/user.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import { uploadImage } from '../../middleware/upload.middleware';
import { USER_ROLES } from '../../utils/constants';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Search users
router.get('/search', searchUsers);

// Authenticated self-service routes
router.get('/profile', getMyProfile);
router.put('/profile', updateMyProfile);
router.put('/password', changeMyPassword);
router.delete('/account', deactivateMyAccount);

// User statistics
router.get(
  '/stats/overview',
  authorizeRoles(USER_ROLES.ADMIN),
  getUserStats
);

// Students by department
router.get(
  '/students/by-department/:departmentId',
  authorizeRoles(USER_ROLES.LECTURER, USER_ROLES.HOD, USER_ROLES.ADMIN),
  getStudentsByDepartment
);

// User management routes
router.get(
  '/',
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.HOD),
  getUsers
);

router.get('/:id', getUserById);
router.put('/:id', updateUser);
router.put('/:id/avatar', uploadImage, updateAvatar);
router.put('/:id/password', changePassword);

// Admin only routes
router.delete('/:id', authorizeRoles(USER_ROLES.ADMIN), deleteUser);
router.put('/:id/activate', authorizeRoles(USER_ROLES.ADMIN), activateUser);
router.put('/:id/role', authorizeRoles(USER_ROLES.ADMIN), updateUserRole);

export default router;

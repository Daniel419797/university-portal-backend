import { Request, Response } from 'express';
import User from '../models/User.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import uploadService from '../services/upload.service';
import { USER_ROLES } from '../utils/constants';
import bcrypt from 'bcrypt';
import AuditLog from '../models/AuditLog.model';

const getAuthenticatedUserId = (req: Request): string => {
  const authUser = (req as any).user;
  return authUser?._id?.toString() || authUser?.userId;
};

/**
 * @desc    Get all users (with filtering and pagination)
 * @route   GET /api/v1/users
 * @access  Private (Admin, HOD)
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { role, department, search, page = 1, limit = 20, isActive } = req.query;

  const query: any = {};

  if (role) query.role = role;
  if (department) query.department = department;
  if (isActive !== undefined) query.isActive = isActive === 'true';

  // Search by name, email, or studentId
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { studentId: { $regex: search, $options: 'i' } },
    ];
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [users, total] = await Promise.all([
    User.find(query)
      .select('-password -refreshToken -passwordResetToken -emailVerificationToken')
      .populate('department', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    User.countDocuments(query),
  ]);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      users,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    })
  );
});

/**
 * @desc    Get user by ID
 * @route   GET /api/v1/users/:id
 * @access  Private (Admin, HOD, or own profile)
 */
export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id)
    .select('-password -refreshToken -passwordResetToken -emailVerificationToken')
    .populate('department', 'name code faculty');

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Students can only view their own profile
  if (
    (req as any).user.role === USER_ROLES.STUDENT &&
    user._id.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You can only view your own profile');
  }

  res.json(ApiResponse.success('Data retrieved successfully', user));
});

/**
 * @desc    Update user profile
 * @route   PUT /api/v1/users/:id
 * @access  Private (Admin or own profile)
 */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Users can only update their own profile unless admin
  if ((req as any).user.role !== USER_ROLES.ADMIN && user._id.toString() !== (req as any).user._id.toString()) {
    throw ApiError.forbidden('You can only update your own profile');
  }

  const {
    firstName,
    lastName,
    phoneNumber,
    address,
    dateOfBirth,
    nationality,
    stateOfOrigin,
    bloodGroup,
    emergencyContact,
  } = req.body;

  // Update allowed fields
  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (phoneNumber) user.phoneNumber = phoneNumber;
  if (address) user.address = address;
  if (dateOfBirth) user.dateOfBirth = dateOfBirth;
  if (nationality) user.nationality = nationality;
  if (stateOfOrigin) user.stateOfOrigin = stateOfOrigin;
  if (bloodGroup) user.bloodGroup = bloodGroup;
  if (emergencyContact) user.emergencyContact = emergencyContact;

  await user.save();

  // Remove sensitive fields
  const userObj: any = user.toObject();
  delete userObj.password;
  delete userObj.refreshTokens;
  delete userObj.passwordResetToken;
  delete userObj.emailVerificationToken;

  res.json(ApiResponse.success('Profile updated successfully', userObj));
});

/**
 * @desc    Update user avatar
 * @route   PUT /api/v1/users/:id/avatar
 * @access  Private (own profile or Admin)
 */
export const updateAvatar = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Users can only update their own avatar unless admin
  if ((req as any).user.role !== USER_ROLES.ADMIN && user._id.toString() !== (req as any).user._id.toString()) {
    throw ApiError.forbidden('You can only update your own avatar');
  }

  if (!req.file) {
    throw ApiError.badRequest('Please upload an image');
  }

  // Delete old avatar if exists
  if (user.avatar) {
    try {
      const publicId = user.avatar.split('/').pop()?.split('.')[0];
      if (publicId) {
        await uploadService.deleteFile(`avatars/${publicId}`);
      }
    } catch (error) {
      // Continue even if deletion fails
    }
  }

  // Upload new avatar
  const result = await uploadService.uploadFile(req.file.path, 'avatars', 'image');
  user.avatar = result.url;

  await user.save();

  res.json(ApiResponse.success('Avatar updated successfully', { avatar: user.avatar }));
});

/**
 * @desc    Change password
 * @route   PUT /api/v1/users/:id/password
 * @access  Private (own profile)
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.params.id).select('+password');

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Users can only change their own password
  if (user._id.toString() !== (req as any).user._id.toString()) {
    throw ApiError.forbidden('You can only change your own password');
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Current password is incorrect');
  }

  // Update password
  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();

  res.json(ApiResponse.success('Password changed successfully', null));
});

/**
 * @desc    Delete user (soft delete)
 * @route   DELETE /api/v1/users/:id
 * @access  Private (Admin only)
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Soft delete
  user.isActive = false;
  await user.save();

  res.json(ApiResponse.success('User deactivated successfully', null));
});

/**
 * @desc    Activate user
 * @route   PUT /api/v1/users/:id/activate
 * @access  Private (Admin only)
 */
export const activateUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  user.isActive = true;
  await user.save();

  res.json(ApiResponse.success('User activated successfully', null));
});

/**
 * @desc    Update user role (Admin only)
 * @route   PUT /api/v1/users/:id/role
 * @access  Private (Admin only)
 */
export const updateUserRole = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Validate role
  const validRoles = Object.values(USER_ROLES);
  if (!validRoles.includes(role)) {
    throw ApiError.badRequest('Invalid role');
  }

  user.role = role;
  await user.save();

  res.json(ApiResponse.success('User role updated successfully', user));
});

/**
 * @desc    Get user statistics
 * @route   GET /api/v1/users/stats/overview
 * @access  Private (Admin only)
 */
export const getUserStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await User.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        active: { $sum: { $cond: ['$isActive', 1, 0] } },
        inactive: { $sum: { $cond: ['$isActive', 0, 1] } },
      },
    },
  ]);

  const totalUsers = await User.countDocuments();
  const verifiedUsers = await User.countDocuments({ isEmailVerified: true });
  const activeUsers = await User.countDocuments({ isActive: true });

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      byRole: stats,
      overall: {
        total: totalUsers,
        verified: verifiedUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
      },
    })
  );
});

/**
 * @desc    Get students by department
 * @route   GET /api/v1/users/students/by-department/:departmentId
 * @access  Private (Lecturer, HOD, Admin)
 */
export const getStudentsByDepartment = asyncHandler(async (req: Request, res: Response) => {
  const { departmentId } = req.params;
  const { level, page = 1, limit = 50 } = req.query;

  const query: any = {
    role: USER_ROLES.STUDENT,
    department: departmentId,
    isActive: true,
  };

  if (level) {
    query.level = parseInt(level as string);
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [students, total] = await Promise.all([
    User.find(query)
      .select('firstName lastName email studentId level')
      .sort({ lastName: 1 })
      .skip(skip)
      .limit(limitNum),
    User.countDocuments(query),
  ]);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      students,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    })
  );
});

/**
 * @desc    Search users
 * @route   GET /api/v1/users/search
 * @access  Private
 */
export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
  const { q, role, limit = 10 } = req.query;

  if (!q || (q as string).length < 2) {
    throw ApiError.badRequest('Search query must be at least 2 characters');
  }

  const query: any = {
    $or: [
      { firstName: { $regex: q, $options: 'i' } },
      { lastName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { studentId: { $regex: q, $options: 'i' } },
    ],
    isActive: true,
  };

  if (role) {
    query.role = role;
  }

  const users = await User.find(query)
    .select('firstName lastName email studentId role avatar')
    .limit(parseInt(limit as string));

  res.json(ApiResponse.success('Data retrieved successfully', users));
});

/**
 * @desc    Get current user's profile
 * @route   GET /api/v1/users/profile
 * @access  Private
 */
export const getMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }

  const user = await User.findById(userId)
    .select('-password -refreshToken -passwordResetToken -emailVerificationToken')
    .populate('department', 'name code faculty');

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  res.json(ApiResponse.success('Profile retrieved successfully', user));
});

/**
 * @desc    Update current user's profile
 * @route   PUT /api/v1/users/profile
 * @access  Private
 */
export const updateMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }

  const user = await User.findById(userId);

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const {
    firstName,
    lastName,
    phoneNumber,
    address,
    dateOfBirth,
    nationality,
    stateOfOrigin,
    bloodGroup,
    emergencyContact,
  } = req.body;

  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (phoneNumber) user.phoneNumber = phoneNumber;
  if (address) user.address = address;
  if (dateOfBirth) user.dateOfBirth = dateOfBirth;
  if (nationality) user.nationality = nationality;
  if (stateOfOrigin) user.stateOfOrigin = stateOfOrigin;
  if (bloodGroup) user.bloodGroup = bloodGroup;
  if (emergencyContact) user.emergencyContact = emergencyContact;

  await user.save();

  const userObj: any = user.toObject();
  delete userObj.password;
  delete userObj.refreshTokens;
  delete userObj.passwordResetToken;
  delete userObj.emailVerificationToken;

  res.json(ApiResponse.success('Profile updated successfully', userObj));
});

/**
 * @desc    Change current user's password
 * @route   PUT /api/v1/users/password
 * @access  Private
 */
export const changeMyPassword = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  const { currentPassword, newPassword } = req.body;

  if (!userId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }

  if (!currentPassword || !newPassword) {
    throw ApiError.badRequest('Current and new passwords are required');
  }

  const user = await User.findById(userId).select('+password');

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Current password is incorrect');
  }

  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();

  res.json(ApiResponse.success('Password changed successfully', null));
});

/**
 * @desc    Deactivate own account
 * @route   DELETE /api/v1/users/account
 * @access  Private
 */
export const deactivateMyAccount = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  const { password, reason } = req.body;

  if (!userId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }

  if (!password) {
    throw ApiError.badRequest('Password confirmation is required');
  }

  const user = await User.findById(userId).select('+password');

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Password is incorrect');
  }

  user.isActive = false;
  user.deletedAt = new Date();
  user.accountLocked = true;
  user.refreshTokens = [];
  await user.save();

  await AuditLog.create({
    user: user._id,
    action: 'account.deactivated',
    resource: 'user',
    resourceId: user._id.toString(),
    details: { reason },
  });

  res.json(ApiResponse.success('Account deactivated successfully', null));
});

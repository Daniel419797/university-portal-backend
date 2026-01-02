import { Request, Response } from 'express';
// Supabase-only: removed Mongo model imports
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import uploadService from '../services/upload.service';
import { USER_ROLES } from '../utils/constants';
import { supabaseAdmin } from '../config/supabase';

type ProfileRow = {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  avatar?: string | null;
  student_id?: string | null;
  department_id?: string | null;
  level?: string | null;
  phone_number?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  state_of_origin?: string | null;
  blood_group?: string | null;
  emergency_contact?: unknown;
  is_active?: boolean | null;
  deleted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type DepartmentRow = {
  name?: string | null;
  code?: string | null;
  faculty?: string | null;
};

type ProfileWithDepartment = ProfileRow & {
  departments?: DepartmentRow | null;
};

function requireSupabaseAdmin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw ApiError.internal('SUPABASE_SERVICE_ROLE_KEY is required for Supabase DB operations');
  }
  return supabaseAdmin();
}

const getAuthenticatedUserId = (req: Request): string => {
  return req.user?.userId || (req.user?._id ? String(req.user._id) : '');
};

/**
 * @desc    Get all users (with filtering and pagination)
 * @route   GET /api/v1/users
 * @access  Private (Admin, HOD)
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { role, department, search, page = 1, limit = 20, isActive } = req.query;
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const from = (pageNum - 1) * limitNum;
  const to = from + limitNum - 1;

  const db = requireSupabaseAdmin();
  let q = db
    .from('profiles')
    .select(
      'id,email,first_name,last_name,role,avatar,student_id,department_id,level,is_active,created_at,departments:departments!profiles_department_fk(name,code)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (role) q = q.eq('role', String(role));
  if (department) q = q.eq('department_id', String(department));
  if (isActive !== undefined) q = q.eq('is_active', String(isActive) === 'true');
  if (search) {
    const s = String(search);
    q = q.or(
      `first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,student_id.ilike.%${s}%`
    );
  }

  const { data, error, count } = await q;
  if (error) {
    throw ApiError.internal(`Failed to load users: ${error.message}`);
  }

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      users: (data || []).map((row) => {
        const r = row as unknown as ProfileWithDepartment;
        return {
          id: r.id,
          email: r.email,
          firstName: r.first_name,
          lastName: r.last_name,
          role: r.role,
          avatar: r.avatar,
          studentId: r.student_id,
          department: r.departments || null,
          level: r.level,
          isActive: r.is_active,
          createdAt: r.created_at,
        };
      }),
      pagination: {
        total: count || 0,
        page: pageNum,
        pages: Math.ceil((count || 0) / limitNum),
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
  const db = requireSupabaseAdmin();
  const { data, error } = await db
    .from('profiles')
    .select('*,departments:departments!profiles_department_fk(name,code,faculty)')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(`Failed to load user: ${error.message}`);
  }
  if (!data) {
    throw ApiError.notFound('User not found');
  }

  const authUserId = getAuthenticatedUserId(req);
  if (req.user?.role === USER_ROLES.STUDENT && data.id !== authUserId) {
    throw ApiError.forbidden('You can only view your own profile');
  }

  const profile = data as unknown as ProfileWithDepartment;
  res.json(
    ApiResponse.success('Data retrieved successfully', {
      id: profile.id,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      role: profile.role,
      avatar: profile.avatar,
      studentId: profile.student_id,
      department: profile.departments || null,
      level: profile.level,
      isActive: profile.is_active,
      deletedAt: profile.deleted_at,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    })
  );
});

/**
 * @desc    Update user profile
 * @route   PUT /api/v1/users/:id
 * @access  Private (Admin or own profile)
 */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const db = requireSupabaseAdmin();
  const authUserId = getAuthenticatedUserId(req);

  const { data: existing, error: loadErr } = await db
    .from('profiles')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (loadErr) throw ApiError.internal(`Failed to load user: ${loadErr.message}`);
  if (!existing) throw ApiError.notFound('User not found');

  if (req.user?.role !== USER_ROLES.ADMIN && existing.id !== authUserId) {
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

  const patch: Partial<ProfileRow> & Record<string, unknown> = {};
  if (firstName) patch.first_name = firstName;
  if (lastName) patch.last_name = lastName;
  if (phoneNumber) patch.phone_number = phoneNumber;
  if (address) patch.address = address;
  if (dateOfBirth) patch.date_of_birth = dateOfBirth;
  if (nationality) patch.nationality = nationality;
  if (stateOfOrigin) patch.state_of_origin = stateOfOrigin;
  if (bloodGroup) patch.blood_group = bloodGroup;
  if (emergencyContact) patch.emergency_contact = emergencyContact;

  const { data: updated, error: updateErr } = await db
    .from('profiles')
    .update(patch)
    .eq('id', req.params.id)
    .select('*')
    .single();

  if (updateErr) throw ApiError.internal(`Failed to update profile: ${updateErr.message}`);

  const updatedProfile = updated as unknown as ProfileRow;

  res.json(
    ApiResponse.success('Profile updated successfully', {
      id: updatedProfile.id,
      email: updatedProfile.email,
      firstName: updatedProfile.first_name,
      lastName: updatedProfile.last_name,
      role: updatedProfile.role,
      avatar: updatedProfile.avatar,
      studentId: updatedProfile.student_id,
      departmentId: updatedProfile.department_id,
      level: updatedProfile.level,
      isActive: updatedProfile.is_active,
    })
  );
});

/**
 * @desc    Update user avatar
 * @route   PUT /api/v1/users/:id/avatar
 * @access  Private (own profile or Admin)
 */
export const updateAvatar = asyncHandler(async (req: Request, res: Response) => {
  const db = requireSupabaseAdmin();
  const authUserId = getAuthenticatedUserId(req);

  const { data: existing, error: loadErr } = await db
    .from('profiles')
    .select('id,avatar')
    .eq('id', req.params.id)
    .maybeSingle();

  if (loadErr) throw ApiError.internal(`Failed to load user: ${loadErr.message}`);
  if (!existing) throw ApiError.notFound('User not found');

  if (req.user?.role !== USER_ROLES.ADMIN && existing.id !== authUserId) {
    throw ApiError.forbidden('You can only update your own avatar');
  }

  if (!req.file) {
    throw ApiError.badRequest('Please upload an image');
  }

  const result = await uploadService.uploadFile(req.file.path, 'avatars', 'image');

  const { data: updated, error: updateErr } = await db
    .from('profiles')
    .update({ avatar: result.url })
    .eq('id', req.params.id)
    .select('avatar')
    .single();

  if (updateErr) throw ApiError.internal(`Failed to update avatar: ${updateErr.message}`);

  const avatarRow = updated as unknown as { avatar?: string | null };

  res.json(ApiResponse.success('Avatar updated successfully', { avatar: avatarRow.avatar }));
});

/**
 * @desc    Change password
 * @route   PUT /api/v1/users/:id/password
 * @access  Private (own profile)
 */
export const changePassword = asyncHandler(async (_req: Request, _res: Response) => {
  throw ApiError.badRequest('Password is managed by the authentication provider');
});

/**
 * @desc    Delete user (soft delete)
 * @route   DELETE /api/v1/users/:id
 * @access  Private (Admin only)
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const db = requireSupabaseAdmin();
  const { error } = await db
    .from('profiles')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', req.params.id);

  if (error) throw ApiError.internal(`Failed to deactivate user: ${error.message}`);
  res.json(ApiResponse.success('User deactivated successfully', null));
});

/**
 * @desc    Activate user
 * @route   PUT /api/v1/users/:id/activate
 * @access  Private (Admin only)
 */
export const activateUser = asyncHandler(async (req: Request, res: Response) => {
  const db = requireSupabaseAdmin();
  const { error } = await db
    .from('profiles')
    .update({ is_active: true, deleted_at: null })
    .eq('id', req.params.id);

  if (error) throw ApiError.internal(`Failed to activate user: ${error.message}`);
  res.json(ApiResponse.success('User activated successfully', null));
});

/**
 * @desc    Update user role (Admin only)
 * @route   PUT /api/v1/users/:id/role
 * @access  Private (Admin only)
 */
export const updateUserRole = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.body;
  const validRoles = Object.values(USER_ROLES);
  if (!validRoles.includes(role)) {
    throw ApiError.badRequest('Invalid role');
  }

  const db = requireSupabaseAdmin();
  const { data, error } = await db
    .from('profiles')
    .update({ role })
    .eq('id', req.params.id)
    .select('*')
    .single();

  if (error) throw ApiError.internal(`Failed to update role: ${error.message}`);
  res.json(ApiResponse.success('User role updated successfully', data));
});

/**
 * @desc    Get user statistics
 * @route   GET /api/v1/users/stats/overview
 * @access  Private (Admin only)
 */
export const getUserStats = asyncHandler(async (_req: Request, res: Response) => {
  const db = requireSupabaseAdmin();
  const roles = Object.values(USER_ROLES);

  const byRole = await Promise.all(
    roles.map(async (r) => {
      const total = await db.from('profiles').select('id', { head: true, count: 'exact' }).eq('role', r);
      const active = await db
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .eq('role', r)
        .eq('is_active', true);
      const inactive = await db
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .eq('role', r)
        .eq('is_active', false);

      if (total.error) throw ApiError.internal(total.error.message);
      if (active.error) throw ApiError.internal(active.error.message);
      if (inactive.error) throw ApiError.internal(inactive.error.message);

      return {
        _id: r,
        count: total.count || 0,
        active: active.count || 0,
        inactive: inactive.count || 0,
      };
    })
  );

  const totalUsersRes = await db.from('profiles').select('id', { head: true, count: 'exact' });
  const activeUsersRes = await db
    .from('profiles')
    .select('id', { head: true, count: 'exact' })
    .eq('is_active', true);

  if (totalUsersRes.error) throw ApiError.internal(totalUsersRes.error.message);
  if (activeUsersRes.error) throw ApiError.internal(activeUsersRes.error.message);

  const totalUsers = totalUsersRes.count || 0;
  const activeUsers = activeUsersRes.count || 0;

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      byRole,
      overall: {
        total: totalUsers,
        verified: totalUsers,
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
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const from = (pageNum - 1) * limitNum;
  const to = from + limitNum - 1;

  const db = requireSupabaseAdmin();
  let q = db
    .from('profiles')
    .select('id,first_name,last_name,email,student_id,level', { count: 'exact' })
    .eq('role', USER_ROLES.STUDENT)
    .eq('department_id', departmentId)
    .eq('is_active', true)
    .order('last_name', { ascending: true })
    .range(from, to);

  if (level) q = q.eq('level', String(level));

  const { data, error, count } = await q;
  if (error) throw ApiError.internal(`Failed to load students: ${error.message}`);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      students: (data || []).map((row) => {
        const r = row as unknown as ProfileRow;
        return {
          id: r.id,
          firstName: r.first_name,
          lastName: r.last_name,
          email: r.email,
          studentId: r.student_id,
          level: r.level,
        };
      }),
      pagination: {
        total: count || 0,
        page: pageNum,
        pages: Math.ceil((count || 0) / limitNum),
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
  if (!q || String(q).length < 2) {
    throw ApiError.badRequest('Search query must be at least 2 characters');
  }

  const db = requireSupabaseAdmin();
  let query = db
    .from('profiles')
    .select('id,first_name,last_name,email,student_id,role,avatar')
    .eq('is_active', true)
    .limit(parseInt(String(limit)));

  if (role) query = query.eq('role', String(role));

  const term = String(q);
  query = query.or(
    `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,student_id.ilike.%${term}%`
  );

  const { data, error } = await query;
  if (error) throw ApiError.internal(`Failed to search users: ${error.message}`);

  res.json(
    ApiResponse.success(
      'Data retrieved successfully',
      (data || []).map((row) => {
        const r = row as unknown as ProfileRow;
        return {
          id: r.id,
          firstName: r.first_name,
          lastName: r.last_name,
          email: r.email,
          studentId: r.student_id,
          role: r.role,
          avatar: r.avatar,
        };
      })
    )
  );
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

  const db = requireSupabaseAdmin();
  const { data, error } = await db
    .from('profiles')
    .select('*,departments:departments!profiles_department_fk(name,code,faculty)')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw ApiError.internal(`Failed to load profile: ${error.message}`);
  if (!data) throw ApiError.notFound('User not found');

  const profile = data as unknown as ProfileWithDepartment;
  res.json(
    ApiResponse.success('Profile retrieved successfully', {
      id: profile.id,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      role: profile.role,
      avatar: profile.avatar,
      studentId: profile.student_id,
      department: profile.departments || null,
      level: profile.level,
      phoneNumber: profile.phone_number,
      address: profile.address,
      dateOfBirth: profile.date_of_birth,
      nationality: profile.nationality,
      stateOfOrigin: profile.state_of_origin,
      bloodGroup: profile.blood_group,
      emergencyContact: profile.emergency_contact,
      isActive: profile.is_active,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    })
  );
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

  const patch: Partial<ProfileRow> & Record<string, unknown> = {};
  if (firstName) patch.first_name = firstName;
  if (lastName) patch.last_name = lastName;
  if (phoneNumber) patch.phone_number = phoneNumber;
  if (address) patch.address = address;
  if (dateOfBirth) patch.date_of_birth = dateOfBirth;
  if (nationality) patch.nationality = nationality;
  if (stateOfOrigin) patch.state_of_origin = stateOfOrigin;
  if (bloodGroup) patch.blood_group = bloodGroup;
  if (emergencyContact) patch.emergency_contact = emergencyContact;

  const db = requireSupabaseAdmin();
  const { data, error } = await db
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('*,departments:departments!profiles_department_fk(name,code,faculty)')
    .single();

  if (error) throw ApiError.internal(`Failed to update profile: ${error.message}`);

  const profile = data as unknown as ProfileWithDepartment;
  res.json(
    ApiResponse.success('Profile updated successfully', {
      id: profile.id,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      role: profile.role,
      avatar: profile.avatar,
      studentId: profile.student_id,
      department: profile.departments || null,
      level: profile.level,
      phoneNumber: profile.phone_number,
      address: profile.address,
      dateOfBirth: profile.date_of_birth,
      nationality: profile.nationality,
      stateOfOrigin: profile.state_of_origin,
      bloodGroup: profile.blood_group,
      emergencyContact: profile.emergency_contact,
      isActive: profile.is_active,
    })
  );
});

/**
 * @desc    Change current user's password
 * @route   PUT /api/v1/users/password
 * @access  Private
 */
export const changeMyPassword = asyncHandler(async (_req: Request, _res: Response) => {
  throw ApiError.badRequest('Password is managed by the authentication provider');
});

/**
 * @desc    Deactivate own account
 * @route   DELETE /api/v1/users/account
 * @access  Private
 */
export const deactivateMyAccount = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }

  const db = requireSupabaseAdmin();
  const { error } = await db
    .from('profiles')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw ApiError.internal(`Failed to deactivate account: ${error.message}`);
  res.json(ApiResponse.success('Account deactivated successfully', null));
});

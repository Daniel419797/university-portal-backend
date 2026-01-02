import { Request, Response } from 'express';
import User from '../models/User.model';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../config/jwt';
import { generateRandomToken, hashToken } from '../utils/helpers';
import { MAX_LOGIN_ATTEMPTS, EMAIL_VERIFICATION_EXPIRY, PASSWORD_RESET_EXPIRY } from '../utils/constants';
import logger from '../config/logger';
import emailService from '../services/email.service';
import { supabaseAdmin, supabaseAnon } from '../config/supabase';
import { SupabaseJwtPayload } from '../config/supabaseAuth';

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
  is_active?: boolean | null;
  two_factor_enabled?: boolean | null;
  last_login?: string | null;
};

function isSupabaseMode(): boolean {
  return process.env.AUTH_STRATEGY === 'supabase';
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function pickNameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = email.split('@')[0] || 'User';
  const cleaned = local.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length >= 2) return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  return { firstName: cleaned || 'User', lastName: 'User' };
}

function normalizeRole(role?: string | null): string | undefined {
  const normalized = safeString(role)?.toLowerCase();
  if (!normalized) return undefined;
  if (['student', 'lecturer', 'admin', 'hod', 'bursary'].includes(normalized)) return normalized;
  return undefined;
}

async function ensureSupabaseProfile(userId: string, email: string, payload?: SupabaseJwtPayload) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  const db = supabaseAdmin();
  const existing = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (existing.error) {
    throw ApiError.internal(`Failed to load profile: ${existing.error.message}`);
  }
  if (existing.data) return existing.data as unknown as ProfileRow;

  const meta = (payload?.user_metadata || {}) as Record<string, unknown>;
  const fromEmail = pickNameFromEmail(email);
  const firstName =
    safeString(meta.firstName) ||
    safeString(meta.first_name) ||
    safeString(meta.given_name) ||
    fromEmail.firstName;
  const lastName =
    safeString(meta.lastName) ||
    safeString(meta.last_name) ||
    safeString(meta.family_name) ||
    fromEmail.lastName;

  const inserted = await db
    .from('profiles')
    .insert({
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      role: 'student',
      is_active: true,
    })
    .select('*')
    .single();

  if (inserted.error) {
    throw ApiError.internal(`Failed to create profile: ${inserted.error.message}`);
  }

  return inserted.data as unknown as ProfileRow;
}

// Register
export const register = asyncHandler(async (req: Request, res: Response) => {
  if (isSupabaseMode()) {
    const { email, password, firstName, lastName, role = 'student' } = req.body;
    if (!email || !password || !firstName || !lastName) {
      throw ApiError.badRequest('Email, password, firstName and lastName are required');
    }

    const anon = supabaseAnon();
    const { data, error } = await anon.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          role,
        },
      },
    });

    if (error) {
      const message = error.message || 'Registration failed';
      if (message.toLowerCase().includes('already registered')) {
        throw ApiError.conflict('Email already registered');
      }
      throw ApiError.badRequest(message);
    }

    const userId = data.user?.id;
    if (userId) {
      // Best-effort create profile row for Postgres-backed app data.
      await ensureSupabaseProfile(userId, email, {
        sub: userId,
        email,
        user_metadata: { first_name: firstName, last_name: lastName, role },
      } as unknown as SupabaseJwtPayload);
    }

    res.status(201).json(
      ApiResponse.success('Registration successful. Please verify your email.', {
        userId,
        email,
      })
    );
    return;
  }

  const { email, password, firstName, lastName, role = 'student' } = req.body;

  const existingUser = await User.findOne({ email, deletedAt: null });
  if (existingUser) {
    throw ApiError.conflict('Email already registered');
  }

  const verificationToken = generateRandomToken();
  const hashedToken = hashToken(verificationToken);

  const user = await User.create({
    email,
    password,
    firstName,
    lastName,
    role,
    emailVerificationToken: hashedToken,
    emailVerificationExpiry: new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY),
  });

  // Send verification email with the plain token (hashed version stored on user)
  const sent = await emailService.sendVerificationEmail(user.email, verificationToken);
  if (!sent) {
    logger.warn(`Verification email not sent for ${user.email}`);
  }

  logger.info(`User registered: ${user.email}`);

  res.status(201).json(
    ApiResponse.success('Registration successful. Please verify your email.', {
      userId: user._id,
      email: user.email,
    })
  );
});

// Login
export const login = asyncHandler(async (req: Request, res: Response) => {
  if (isSupabaseMode()) {
    const { email, password } = req.body;
    if (!email || !password) {
      throw ApiError.badRequest('Email and password are required');
    }

    const anon = supabaseAnon();
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    const userId = data.user.id;
    const profile = await ensureSupabaseProfile(userId, email, {
      sub: userId,
      email,
      app_metadata: data.user.app_metadata as Record<string, unknown>,
      user_metadata: data.user.user_metadata as Record<string, unknown>,
    } as unknown as SupabaseJwtPayload);

    const roleFromProfile = normalizeRole(profile?.role ?? undefined);
    const roleFromToken = normalizeRole((data.user.app_metadata as any)?.role ?? undefined);

    res.status(200).json(
      ApiResponse.success('Login successful', {
        user: {
          id: userId,
          email: data.user.email,
          firstName: profile?.first_name || (data.user.user_metadata as any)?.first_name,
          lastName: profile?.last_name || (data.user.user_metadata as any)?.last_name,
          role: roleFromToken || roleFromProfile || 'student',
          twoFactorEnabled: false,
        },
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      })
    );
    return;
  }

  const { email, password } = req.body;

  const user = await User.findOne({ email, deletedAt: null }).select('+password');
  if (!user) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (user.accountLocked) {
    throw ApiError.forbidden('Account is locked. Please contact support.');
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.accountLocked = true;
    }
    await user.save();
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (!user.isEmailVerified) {
    throw ApiError.forbidden('Please verify your email before logging in');
  }

  user.failedLoginAttempts = 0;
  user.lastLogin = new Date();

  const accessToken = generateAccessToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  const refreshToken = generateRefreshToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  user.refreshTokens.push(refreshToken);
  await user.save();

  logger.info(`User logged in: ${user.email}`);

  res.status(200).json(
    ApiResponse.success('Login successful', {
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      accessToken,
      refreshToken,
    })
  );
});

// Logout
export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (isSupabaseMode()) {
    // Supabase access/refresh token revocation is typically handled client-side.
    // This endpoint exists for API compatibility.
    res.status(200).json(ApiResponse.success('Logout successful'));
    return;
  }

  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw ApiError.badRequest('Refresh token is required');
  }

  const decoded = verifyRefreshToken(refreshToken);
  const user = await User.findById(decoded.userId);

  if (user) {
    user.refreshTokens = user.refreshTokens.filter((token) => token !== refreshToken);
    await user.save();
  }

  res.status(200).json(ApiResponse.success('Logout successful'));
});

// Refresh token
export const refreshAccessToken = asyncHandler(async (req: Request, res: Response) => {
  if (isSupabaseMode()) {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw ApiError.badRequest('Refresh token is required');
    }

    const anon = supabaseAnon();
    const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    res.status(200).json(
      ApiResponse.success('Token refreshed successfully', {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      })
    );
    return;
  }

  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw ApiError.badRequest('Refresh token is required');
  }

  const decoded = verifyRefreshToken(refreshToken);
  const user = await User.findById(decoded.userId);

  if (!user || !user.refreshTokens.includes(refreshToken)) {
    throw ApiError.unauthorized('Invalid refresh token');
  }

  const newAccessToken = generateAccessToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  res.status(200).json(
    ApiResponse.success('Token refreshed successfully', {
      accessToken: newAccessToken,
    })
  );
});

// Verify email
export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  if (isSupabaseMode()) {
    throw ApiError.badRequest('Email verification is handled by Supabase. Use the verification link in the email.');
  }

  const { token } = req.body;

  if (!token) {
    throw ApiError.badRequest('Verification token is required');
  }

  const hashedToken = hashToken(token);
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpiry: { $gt: Date.now() },
    deletedAt: null,
  });

  if (!user) {
    throw ApiError.badRequest('Invalid or expired verification token');
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpiry = undefined;
  await user.save();

  logger.info(`Email verified: ${user.email}`);

  res.status(200).json(ApiResponse.success('Email verified successfully'));
});

// Forgot password
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  if (isSupabaseMode()) {
    const { email } = req.body;
    if (!email) {
      throw ApiError.badRequest('Email is required');
    }

    const redirectBase = process.env.CLIENT_URL || '';
    const redirectTo = redirectBase ? `${redirectBase.replace(/\/+$/, '')}/reset-password` : undefined;

    const anon = supabaseAnon();
    const { error } = await anon.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      // Avoid leaking whether email exists.
      logger.warn(`Supabase resetPasswordForEmail error: ${error.message}`);
    }

    res.status(200).json(ApiResponse.success('If the email exists, a password reset link will be sent'));
    return;
  }

  const { email } = req.body;

  const user = await User.findOne({ email, deletedAt: null });
  if (!user) {
    res.status(200).json(
      ApiResponse.success('If the email exists, a password reset link will be sent')
    );
    return;
  }

  const resetToken = generateRandomToken();
  const hashedToken = hashToken(resetToken);

  user.passwordResetToken = hashedToken;
  user.passwordResetExpiry = new Date(Date.now() + PASSWORD_RESET_EXPIRY);
  await user.save();

  const sent = await emailService.sendPasswordResetEmail(user.email, resetToken);
  if (!sent) {
    logger.warn(`Password reset email not sent for ${user.email}`);
  }

  logger.info(`Password reset requested: ${user.email}`);

  res.status(200).json(
    ApiResponse.success('If the email exists, a password reset link will be sent')
  );
});

// Reset password
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  if (isSupabaseMode()) {
    throw ApiError.badRequest(
      'Password reset is handled by Supabase. Use the reset link email flow (client-side) to set a new password.'
    );
  }

  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    throw ApiError.badRequest('Token and new password are required');
  }

  const hashedToken = hashToken(token);
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpiry: { $gt: Date.now() },
    deletedAt: null,
  });

  if (!user) {
    throw ApiError.badRequest('Invalid or expired reset token');
  }

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpiry = undefined;
  user.refreshTokens = [];
  await user.save();

  logger.info(`Password reset: ${user.email}`);

  res.status(200).json(ApiResponse.success('Password reset successful'));
});

// Get current user
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  if (isSupabaseMode()) {
    const userId = req.user?.userId;
    if (!userId) {
      throw ApiError.unauthorized('Unable to determine authenticated user');
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw ApiError.internal('SUPABASE_SERVICE_ROLE_KEY is required to load profiles');
    }

    const db = supabaseAdmin();
    const profileRes = await db
      .from('profiles')
      .select('id,email,first_name,last_name,role,avatar,student_id,department_id,level,is_active,two_factor_enabled,last_login,departments(name,code,faculty)')
      .eq('id', userId)
      .maybeSingle();

    if (profileRes.error) {
      throw ApiError.internal(`Failed to load profile: ${profileRes.error.message}`);
    }
    if (!profileRes.data) {
      throw ApiError.notFound('User not found');
    }

    const authRes = await db.auth.admin.getUserById(userId);
    const isEmailVerified = Boolean(authRes.data?.user?.email_confirmed_at);

    res.status(200).json(
      ApiResponse.success('User retrieved successfully', {
        id: profileRes.data.id,
        email: profileRes.data.email,
        firstName: (profileRes.data as any).first_name,
        lastName: (profileRes.data as any).last_name,
        role: (profileRes.data as any).role,
        avatar: (profileRes.data as any).avatar,
        studentId: (profileRes.data as any).student_id,
        department: (profileRes.data as any).departments || null,
        level: (profileRes.data as any).level,
        isEmailVerified,
        twoFactorEnabled: Boolean((profileRes.data as any).two_factor_enabled),
        lastLogin: (profileRes.data as any).last_login,
      })
    );
    return;
  }

  const user = await User.findById((req as any).user?.userId);

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  res.status(200).json(
    ApiResponse.success('User retrieved successfully', {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      avatar: user.avatar,
      studentId: user.studentId,
      department: user.department,
      level: user.level,
      isEmailVerified: user.isEmailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      lastLogin: user.lastLogin,
    })
  );
});

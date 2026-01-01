import { Request, Response } from 'express';
import User from '../models/User.model';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../config/jwt';
import { generateRandomToken, hashToken } from '../utils/helpers';
import { MAX_LOGIN_ATTEMPTS, EMAIL_VERIFICATION_EXPIRY, PASSWORD_RESET_EXPIRY } from '../utils/constants';
import logger from '../config/logger';

// Register
export const register = asyncHandler(async (req: Request, res: Response) => {
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

  // TODO: Send verification email
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

  // TODO: Send password reset email
  logger.info(`Password reset requested: ${user.email}`);

  res.status(200).json(
    ApiResponse.success('If the email exists, a password reset link will be sent')
  );
});

// Reset password
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
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
  const user = await User.findById((req as any).user?.userId).populate('department', 'name code');

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

import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { UserRole } from '../types';
import logger from '../config/logger';

export const authorizeRoles = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!(req as any).user) {
      throw ApiError.unauthorized('Authentication required');
    }

    // Debug: log the current user role and allowed roles to help diagnose authorization failures
    try {
      const currentRole = (req as any).user.role;
      logger.info('authorizeRoles check', { allowedRoles: roles, currentRole });
    } catch (e) {
      // swallow logging errors to avoid affecting authorization flow
    }

    if (!roles.includes((req as any).user.role)) {
      throw ApiError.forbidden('You do not have permission to access this resource');
    }

    next();
  };
};

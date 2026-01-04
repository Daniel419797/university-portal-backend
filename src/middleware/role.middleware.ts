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
      const currentRoleRaw = (req as any).user.role;
      logger.info('authorizeRoles check', { allowedRoles: roles, currentRole: currentRoleRaw });
      // Also print to stdout so the message appears in hosting platform logs
      // eslint-disable-next-line no-console
      console.log('authorizeRoles check', { allowedRoles: roles, currentRole: currentRoleRaw });

      // Normalize roles for robust comparison (handles casing/whitespace)
      const normalize = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
      const currentRole = normalize(currentRoleRaw);
      const allowed = (roles || []).map((r) => normalize(r));

      if (!allowed.includes(currentRole)) {
        throw ApiError.forbidden('You do not have permission to access this resource');
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // If logging or normalization threw, fail closed (forbidden)
      throw ApiError.forbidden('You do not have permission to access this resource');
    }

    next();
  };
};

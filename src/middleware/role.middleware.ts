import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { UserRole } from '../types';

export const authorizeRoles = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!(req as any).user) {
      throw ApiError.unauthorized('Authentication required');
    }

    if (!roles.includes((req as any).user.role)) {
      throw ApiError.forbidden('You do not have permission to access this resource');
    }

    next();
  };
};

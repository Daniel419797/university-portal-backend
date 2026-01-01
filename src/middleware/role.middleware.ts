import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { UserRole } from '../types';

export const authorizeRoles = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    if (!roles.includes(req.user.role as UserRole)) {
      throw ApiError.forbidden('You do not have permission to access this resource');
    }

    next();
  };
};

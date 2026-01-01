import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../config/jwt';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('No token provided');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw ApiError.unauthorized('No token provided');
    }

    try {
      const decoded = verifyAccessToken(token);
      (req as any).user = decoded;
      next();
    } catch (error) {
      throw ApiError.unauthorized('Invalid or expired token');
    }
  }
);

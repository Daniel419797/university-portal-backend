import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import logger from '../config/logger';

export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = 500;
    const message = error.message || 'Internal Server Error';
    error = new ApiError(statusCode, message, false, err.stack);
  }

  const apiError = error as ApiError;
  const statusCode = apiError.statusCode || 500;

  const response = {
    success: false,
    message: apiError.message,
    ...(process.env.NODE_ENV === 'development' && { stack: apiError.stack }),
  };

  logger.error(`${statusCode} - ${apiError.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);

  res.status(statusCode).json(response);
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = ApiError.notFound(`Route ${req.originalUrl} not found`);
  next(error);
};

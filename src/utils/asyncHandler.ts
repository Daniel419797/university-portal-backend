import { Request, Response, NextFunction } from 'express';

type AsyncFunction = (req: any, res: any, next: any) => Promise<any>;

export const asyncHandler = (fn: AsyncFunction) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

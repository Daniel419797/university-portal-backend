import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: any;
        userId: string;
        email: string;
        role: string;
        claims?: Record<string, unknown>;
      };
    }
  }
}

export interface AuthRequest extends Request {
  user?: {
    _id: any;
    userId: string;
    email: string;
    role: string;
    claims?: Record<string, unknown>;
  };
}

export {};

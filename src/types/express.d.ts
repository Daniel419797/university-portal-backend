export {};

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      _id?: string;
      userId?: string;
      email?: string;
      role?: string;
      claims?: Record<string, unknown>;
    };
  }
}

import { ApiError } from './ApiError';

export function throwIfSupabaseError(error: unknown, message: string): never | void {
  if (!error) return;

  const err = error as { message?: string; details?: string; hint?: string; code?: string };
  const details = [err.message, err.details, err.hint, err.code].filter(Boolean).join(' | ');
  throw ApiError.internal(`${message}${details ? `: ${details}` : ''}`);
}

export function requireData<T>(data: T | null | undefined, message: string): T {
  if (data === null || data === undefined) {
    throw ApiError.notFound(message);
  }
  return data;
}

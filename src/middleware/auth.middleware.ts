import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../config/jwt';
import { SupabaseJwtPayload, verifySupabaseAccessToken } from '../config/supabaseAuth';
import { supabaseAdmin } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

type ProfileRow = {
  id: string;
  email?: string | null;
  role?: string | null;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  return token || null;
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function pickNameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = email.split('@')[0] || 'User';
  const cleaned = local.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length >= 2) return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  return { firstName: cleaned || 'User', lastName: 'User' };
}

function normalizeRole(role?: string | null): string | undefined {
  const normalized = safeString(role)?.toLowerCase();
  if (!normalized) return undefined;
  if (['student', 'lecturer', 'admin', 'hod', 'bursary'].includes(normalized)) return normalized;
  return undefined;
}

async function ensureSupabaseProfile(
  userId: string,
  email: string,
  payload: SupabaseJwtPayload
): Promise<ProfileRow | null> {
  // Only attempt profile read/create when backend has service role access.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  const db = supabaseAdmin();
  const existing = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (existing.error) {
    throw ApiError.internal(`Failed to load profile: ${existing.error.message}`);
  }
  if (existing.data) return existing.data as unknown as ProfileRow;

  const meta = (payload.user_metadata || {}) as Record<string, unknown>;
  const fromEmail = pickNameFromEmail(email);

  const firstName =
    safeString(meta.firstName) ||
    safeString(meta.first_name) ||
    safeString(meta.given_name) ||
    fromEmail.firstName;

  const lastName =
    safeString(meta.lastName) ||
    safeString(meta.last_name) ||
    safeString(meta.family_name) ||
    fromEmail.lastName;

  const role = normalizeRole(meta.role as string) || 'student';

  const inserted = await db
    .from('profiles')
    .insert({
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      role,
      is_active: true,
    })
    .select('*')
    .single();

  if (inserted.error) {
    throw ApiError.internal(`Failed to create profile: ${inserted.error.message}`);
  }

  return inserted.data as unknown as ProfileRow;
}

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = getBearerToken(req);
  if (!token) throw ApiError.unauthorized('No token provided');

  if (process.env.AUTH_STRATEGY === 'supabase') {
    try {
      const payload = await verifySupabaseAccessToken(token);
      const userId = safeString(payload.sub);
      const email = safeString(payload.email);

      if (!userId || !email) {
        throw ApiError.unauthorized('Invalid Supabase token (missing subject/email)');
      }

      const profile = await ensureSupabaseProfile(userId, email, payload);
      const roleFromProfile = normalizeRole(profile?.role ?? undefined);
      const appMeta = (payload.app_metadata || {}) as Record<string, unknown>;
      const roleFromToken = normalizeRole(typeof appMeta.role === 'string' ? appMeta.role : undefined);

      req.user = {
        _id: userId,
        userId,
        email: profile?.email || email,
        role: roleFromToken || roleFromProfile || 'student',
        claims: payload,
      };

      return next();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Log detailed error for debugging JWT issues
      console.error('[auth] Supabase token verification failed:', {
        // authStrategy: process.env.AUTH_STRATEGY,
        // supabaseUrl: process.env.SUPABASE_URL,
        // issuer: process.env.SUPABASE_JWT_ISSUER,
        // audience: process.env.SUPABASE_JWT_AUDIENCE,
        error: errMsg,
      });
      throw ApiError.unauthorized(`Invalid or expired token: ${errMsg}`);
    }
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      _id: decoded.userId,
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };
    return next();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[auth] Local token verification failed:', { error: errMsg });
    throw ApiError.unauthorized(`Invalid or expired token: ${errMsg}`);
  }
});

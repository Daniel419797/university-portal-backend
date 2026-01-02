import jwt, { JwtHeader } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export type SupabaseJwtPayload = jwt.JwtPayload & {
  email?: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function isSupabaseAuthEnabled(): boolean {
  return Boolean(process.env.AUTH_STRATEGY === 'supabase' || process.env.SUPABASE_URL);
}

export function getSupabaseIssuer(): string {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required when AUTH_STRATEGY=supabase');
  }
  return process.env.SUPABASE_JWT_ISSUER || `${normalizeBaseUrl(supabaseUrl)}/auth/v1`;
}

export function getSupabaseJwksUrl(): string {
  const issuer = getSupabaseIssuer();
  return process.env.SUPABASE_JWKS_URL || `${normalizeBaseUrl(issuer)}/certs`;
}

export async function verifySupabaseAccessToken(token: string): Promise<SupabaseJwtPayload> {
  const issuer = getSupabaseIssuer();
  const jwksUrl = getSupabaseJwksUrl();
  const audience = process.env.SUPABASE_JWT_AUDIENCE || 'authenticated';

  const client = jwksClient({
    jwksUri: jwksUrl,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 10 * 60 * 1000,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });

  const getKey: jwt.GetPublicKeyOrSecret = (header: JwtHeader, callback) => {
    const kid = header.kid;
    if (!kid) {
      callback(new Error('Missing kid in JWT header'));
      return;
    }
    client.getSigningKey(kid, (err, key) => {
      if (err || !key) {
        callback(err || new Error('Unable to fetch signing key'));
        return;
      }
      const signingKey = 'getPublicKey' in key ? key.getPublicKey() : (key as any).publicKey;
      callback(null, signingKey);
    });
  };

  const verified = await new Promise<SupabaseJwtPayload>((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        issuer,
        audience,
        algorithms: ['RS256', 'ES256'],
      },
      (err, decoded) => {
        if (err || !decoded) return reject(err || new Error('Token verification failed'));
        resolve(decoded as SupabaseJwtPayload);
      }
    );
  });

  return verified;
}

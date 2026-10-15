export interface InvoiceAccessEnv {
  INVOICE_ACCESS_ISSUER?: string;
  INVOICE_ACCESS_AUD?: string;
}
export type Identity = { email: string };
type KeySet = { keys: (JsonWebKey & { kid?: string; alg?: string })[] };
const cache = new Map<string, { expires: number; keys: KeySet['keys'] }>();

export function accessConfigured(env: InvoiceAccessEnv): boolean {
  return Boolean(env.INVOICE_ACCESS_AUD && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.INVOICE_ACCESS_ISSUER ?? ''));
}
function bytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid token');
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
export async function verifyAccessToken(token: string, issuer: string, audience: string,
  loadKeys: () => Promise<KeySet['keys']>, now = Math.floor(Date.now() / 1000)): Promise<Identity> {
  if (token.length > 16000) throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const decoder = new TextDecoder();
  const header = JSON.parse(decoder.decode(bytes(parts[0])));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Invalid token');
  const key = (await loadKeys()).find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA' && (!candidate.alg || candidate.alg === 'RS256'));
  if (!key) throw new Error('Invalid token');
  const publicKey = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, bytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!verified) throw new Error('Invalid token');
  const payload = JSON.parse(decoder.decode(bytes(parts[1])));
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== issuer || !audiences.includes(audience) || !Number.isSafeInteger(payload.exp) || payload.exp <= now
    || (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > now + 30))
    || typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error('Invalid token');
  return { email: payload.email.toLowerCase() };
}
export async function authenticateInvoice(request: Request, env: InvoiceAccessEnv): Promise<Identity | null> {
  if (!accessConfigured(env)) return null;
  const issuer = env.INVOICE_ACCESS_ISSUER!;
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || token.length > 16000) return null;
  try {
    const kid = JSON.parse(new TextDecoder().decode(bytes(token.split('.')[0]))).kid;
    const loadKeys = async () => {
      const hit = cache.get(issuer);
      if (hit && hit.expires > Date.now() && hit.keys.some((key) => key.kid === kid)) return hit.keys;
      const response = await fetch(issuer + '/cdn-cgi/access/certs', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Access unavailable');
      const body = await response.json() as KeySet;
      if (!Array.isArray(body.keys) || body.keys.length > 100) throw new Error('Invalid key set');
      cache.set(issuer, { expires: Date.now() + 600000, keys: body.keys });
      return body.keys;
    };
    return await verifyAccessToken(token, issuer, env.INVOICE_ACCESS_AUD!, loadKeys);
  } catch { return null; }
}
export function privateHeaders(contentType = 'application/json; charset=utf-8'): Headers {
  return new Headers({
    'content-type': contentType, 'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
}


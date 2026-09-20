// Marker's one product route: publish a read-only page of highlights.
//
// This is the pattern for gating a feature on your own backend: the extension
// sends its entitlement token as a bearer credential and the Worker verifies the
// signature, issuer, expiry and type before it stores anything. A modified
// extension that flips its local "isPro" flag gets a 403 here.

import { verifyLicenseKey } from './jwt.js';

export const SHARE_TTL_SECONDS = 90 * 86400;
export const SHARE_LIMITS = { highlights: 200, textChars: 2000, titleChars: 200, urlChars: 2048, bodyBytes: 64 * 1024 };
const COLORS = new Set(['yellow', 'green', 'pink', 'blue']);
const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** @typedef {import('./index.js').Env} Env */

/**
 * Accepts an install-bound entitlement token, or a trial key (trials never get
 * an entitlement token). A bare purchase key is refused: it is a long-lived
 * bearer secret and proves nothing about whether the subscription is still paid.
 * @param {Request} request
 * @param {Env} env
 */
async function entitledClaims(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const claims = await verifyLicenseKey(token, env.LICENSE_PRIVATE_JWK);
  if (!claims) return null;
  if (claims.typ === 'entitlement' || claims.plan === 'trial') return claims;
  return null;
}

/** @param {unknown} body */
export function validateShare(body) {
  if (!body || typeof body !== 'object') return null;
  const { url, title, highlights } = /** @type {Record<string, unknown>} */ (body);
  if (typeof url !== 'string' || url.length > SHARE_LIMITS.urlChars || !/^https?:\/\//.test(url)) return null;
  if (title !== undefined && (typeof title !== 'string' || title.length > SHARE_LIMITS.titleChars)) return null;
  if (!Array.isArray(highlights) || highlights.length === 0 || highlights.length > SHARE_LIMITS.highlights) return null;
  const clean = [];
  for (const h of highlights) {
    if (!h || typeof h !== 'object') return null;
    const { text, color } = /** @type {Record<string, unknown>} */ (h);
    if (typeof text !== 'string' || !text.trim() || text.length > SHARE_LIMITS.textChars) return null;
    if (!COLORS.has(/** @type {string} */ (color))) return null;
    clean.push({ text, color });
  }
  return { url, title: title || '', highlights: clean };
}

export function newShareId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

/**
 * POST /share  (Authorization: Bearer <entitlement token>)
 * @param {Request} request
 * @param {Env} env
 * @param {Record<string, string>} cors
 * @param {(obj: unknown, status: number, cors: Record<string, string>) => Response} json
 */
export async function handleShare(request, env, cors, json) {
  const claims = await entitledClaims(request, env);
  if (!claims) return json({ error: 'not_entitled' }, 403, cors);

  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > SHARE_LIMITS.bodyBytes) return json({ error: 'too_large' }, 413, cors);
  const raw = await request.text();
  if (raw.length > SHARE_LIMITS.bodyBytes) return json({ error: 'too_large' }, 413, cors);

  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  const share = validateShare(body);
  if (!share) return json({ error: 'invalid_request' }, 400, cors);

  const id = newShareId();
  const record = { ...share, createdAt: Math.floor(Date.now() / 1000), owner: claims.sub };
  await env.LICENSES.put(`share:${id}`, JSON.stringify(record), { expirationTtl: SHARE_TTL_SECONDS });
  console.log({ msg: 'share published', id, sub: claims.sub, highlights: share.highlights.length });
  return json({ id, expiresAt: record.createdAt + SHARE_TTL_SECONDS }, 201, cors);
}

/**
 * GET /share?id=…  — public, read-only.
 * @param {URL} url
 * @param {Env} env
 * @param {Record<string, string>} cors
 * @param {(obj: unknown, status: number, cors: Record<string, string>) => Response} json
 */
export async function handleShareGet(url, env, cors, json) {
  const id = url.searchParams.get('id') || '';
  if (!/^[A-Za-z0-9]{12}$/.test(id)) return json({ error: 'not_found' }, 404, cors);
  const record = await env.LICENSES.get(`share:${id}`, 'json');
  if (!record) return json({ error: 'not_found' }, 404, cors);
  const { owner: _owner, ...publicRecord } = record;
  return json(publicRecord, 200, { ...cors, 'Cache-Control': 'public, max-age=300' });
}

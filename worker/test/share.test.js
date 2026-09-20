import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { ISSUER, RATE_LIMITS, signLicense } from '../src/index.js';
import { SHARE_LIMITS, SHARE_TTL_SECONDS, newShareId, validateShare } from '../src/share.js';
import { baseEnv, get, now, testJwk } from './helpers.js';

const page = (extra = {}) => ({
  url: 'https://example.com/article',
  title: 'An article',
  highlights: [{ text: 'first quote', color: 'yellow' }, { text: 'second', color: 'blue' }],
  ...extra
});

const entitlement = (env, over = {}) => signLicense(
  { sub: 'sub_1', plan: 'monthly', typ: 'entitlement', install: 'install_a', iss: ISSUER, iat: 1, exp: now() + 3600, ...over },
  env.LICENSE_PRIVATE_JWK
);

const share = (body, env, token, headers = {}) => worker.fetch(
  new Request('https://license.example.test/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }),
  env,
  { waitUntil() {} }
);

test('/share has a rate limit entry', () => {
  assert.ok(RATE_LIMITS['/share'].max > 0);
});

test('publishes with a valid entitlement token and serves it back read-only', async () => {
  const env = await baseEnv();
  const res = await share(page(), env, await entitlement(env));
  assert.equal(res.status, 201);
  const { id, expiresAt } = await res.json();
  assert.match(id, /^[A-Za-z0-9]{12}$/);
  assert.ok(expiresAt > now() + SHARE_TTL_SECONDS - 60);

  const stored = env.LICENSES.json(`share:${id}`);
  assert.equal(stored.owner, 'sub_1');

  const view = await get(`/share?id=${id}`, env);
  assert.equal(view.status, 200);
  assert.equal(view.headers.get('Cache-Control'), 'public, max-age=300');
  const body = await view.json();
  assert.deepEqual(body.highlights, page().highlights);
  assert.equal(body.title, 'An article');
  assert.equal(body.owner, undefined, 'owner never leaves the Worker');
});

test('trial keys may share; bare purchase keys, tampered and expired tokens may not', async () => {
  const env = await baseEnv();
  const trial = await signLicense({ sub: 'trial_1', plan: 'trial', iss: ISSUER, iat: 1, exp: now() + 3600 }, env.LICENSE_PRIVATE_JWK);
  assert.equal((await share(page(), env, trial)).status, 201);

  const purchaseKey = await signLicense({ sub: 'sub_1', plan: 'monthly', iss: ISSUER, iat: 1, exp: now() + 3600 }, env.LICENSE_PRIVATE_JWK);
  assert.equal((await share(page(), env, purchaseKey)).status, 403);

  assert.equal((await share(page(), env, await entitlement(env, { exp: now() - 1 }))).status, 403);

  const foreign = await signLicense({ sub: 'sub_1', plan: 'monthly', typ: 'entitlement', iss: ISSUER, iat: 1, exp: now() + 3600 }, await testJwk());
  assert.equal((await share(page(), env, foreign)).status, 403);

  const token = await entitlement(env);
  const [h, p, s] = token.split('.');
  const flipped = `${h}.${p.slice(0, -1)}${p.endsWith('A') ? 'B' : 'A'}.${s}`;
  assert.equal((await share(page(), env, flipped)).status, 403);

  assert.equal((await share(page(), env, null)).status, 403);
  assert.equal(env.LICENSES.store.size, 1, 'only the trial share was stored');
});

test('rejects malformed pages and oversized bodies', async () => {
  const env = await baseEnv();
  const token = await entitlement(env);
  for (const bad of [
    page({ url: 'javascript:alert(1)' }),
    page({ highlights: [] }),
    page({ highlights: [{ text: 'x', color: 'red' }] }),
    page({ highlights: [{ text: '   ', color: 'yellow' }] }),
    page({ highlights: Array.from({ length: SHARE_LIMITS.highlights + 1 }, () => ({ text: 'x', color: 'yellow' })) }),
    page({ title: 't'.repeat(SHARE_LIMITS.titleChars + 1) }),
    'not json'
  ]) {
    assert.equal((await share(bad, env, token)).status, 400);
  }
  const huge = page({ highlights: Array.from({ length: 40 }, () => ({ text: 'x'.repeat(SHARE_LIMITS.textChars), color: 'yellow' })) });
  assert.equal((await share(huge, env, token)).status, 413);
  assert.equal(env.LICENSES.store.size, 0);
});

test('unknown or malformed ids are 404', async () => {
  const env = await baseEnv();
  assert.equal((await get('/share?id=abcdefghijkm', env)).status, 404);
  assert.equal((await get('/share?id=../etc', env)).status, 404);
  assert.equal((await get('/share', env)).status, 404);
});

test('validateShare and newShareId helpers', () => {
  assert.equal(validateShare(null), null);
  assert.deepEqual(validateShare(page({ title: undefined })).title, '');
  const ids = new Set(Array.from({ length: 50 }, newShareId));
  assert.equal(ids.size, 50);
});

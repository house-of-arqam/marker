// Publishing a read-only page of highlights through the licensing Worker.
// The Worker verifies the proof server-side before storing anything, so a
// modified extension cannot share without a valid entitlement.

import { licenseApiBase, URLS } from '../config';
import { getStoredLicenseKey, verifyLicenseKey } from '../licensing';
import type { PageHighlights } from './model';

export type ShareResult = { ok: true; url: string } | { ok: false; reason: 'not-entitled' | 'too-large' | 'unavailable' };

// The install-bound entitlement token is the proof; trials never get one, so
// the (short-lived) trial key stands in. A bare purchase key is never sent: the
// Worker refuses it, and a long-lived bearer secret should not travel anyway.
async function proof(): Promise<string | null> {
  const { entitlementToken } = await chrome.storage.local.get(['entitlementToken']);
  if (typeof entitlementToken === 'string' && entitlementToken) return entitlementToken;
  const key = await getStoredLicenseKey();
  if (!key) return null;
  const result = await verifyLicenseKey(key);
  return result.ok && result.claims.plan === 'trial' ? key : null;
}

export function shareViewerUrl(id: string): string {
  return `${URLS.site}/share#${encodeURIComponent(id)}`;
}

export async function publish(page: PageHighlights): Promise<ShareResult> {
  const token = await proof();
  if (!token) return { ok: false, reason: 'not-entitled' };
  try {
    const res = await fetch(`${licenseApiBase()}/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        url: page.url,
        title: page.title,
        highlights: page.highlights.map(h => ({ text: h.text, color: h.color }))
      })
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-entitled' };
    if (res.status === 413) return { ok: false, reason: 'too-large' };
    if (!res.ok) return { ok: false, reason: 'unavailable' };
    const data = (await res.json()) as { id?: unknown };
    if (typeof data.id !== 'string') return { ok: false, reason: 'unavailable' };
    return { ok: true, url: shareViewerUrl(data.id) };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

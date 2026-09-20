// Toolbar popup: the current page's highlights, the free-plan meter, and the two
// Pro actions (Markdown export, share page). Keep `refreshStatusIfStale` so a
// cancelled subscription is revoked promptly when the user opens the popup.

import { PRODUCT } from '../config';
import { EntitlementStatus, getEntitlementStatus, hasFeature, licenseService } from '../licensing';
import { FEATURE, FREE_HIGHLIGHT_LIMIT, PageHighlights, countAllHighlights, loadPage, savePage, toMarkdown } from '../marker/model';
import { publish } from '../marker/share';
import { $, openExtensionPage, setProductName, setStatus } from './dom';

let page: PageHighlights | null = null;

async function currentTabUrl(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url && /^https?:/.test(tab.url) ? tab.url : null;
}

function renderTier(status: EntitlementStatus): void {
  const badge = $('tier-badge');
  badge.textContent = status.tier === 'free' ? 'Free' : status.tier === 'trial' ? 'Trial' : PRODUCT.proLabel;
  badge.className = `badge ${status.tier === 'free' ? '' : status.tier}`;
  $('upgrade').classList.toggle('hidden', status.tier === 'pro');
}

async function renderQuota(): Promise<void> {
  const unlimited = await hasFeature(FEATURE.unlimited);
  $('quota').classList.toggle('hidden', unlimited);
  if (unlimited) return;
  const used = await countAllHighlights();
  $('quota-count').textContent = `${used} / ${FREE_HIGHLIGHT_LIMIT}`;
  $('quota-bar').style.width = `${Math.min(100, (used / FREE_HIGHLIGHT_LIMIT) * 100)}%`;
  $('quota-bar').classList.toggle('full', used >= FREE_HIGHLIGHT_LIMIT);
}

function renderHighlights(): void {
  const list = $('highlights');
  const items = page?.highlights ?? [];
  $('page-count').textContent = `${items.length} highlight${items.length === 1 ? '' : 's'}`;
  $('empty').classList.toggle('hidden', items.length > 0 || page === null);
  if (page === null) $('empty').textContent = `${PRODUCT.name} works on http(s) pages.`;
  list.replaceChildren(
    ...items.map(h => {
      const li = document.createElement('li');
      li.dataset.color = h.color;
      const text = document.createElement('span');
      text.className = 'quote';
      text.textContent = h.text.replace(/\s+/g, ' ').trim();
      text.title = text.textContent;
      const remove = document.createElement('button');
      remove.className = 'link';
      remove.textContent = '×';
      remove.title = 'Remove';
      remove.addEventListener('click', async () => {
        if (!page) return;
        page.highlights = page.highlights.filter(x => x.id !== h.id);
        await savePage(page);
        renderHighlights();
        await renderQuota();
      });
      li.append(text, remove);
      return li;
    })
  );
  const hasAny = items.length > 0;
  $<HTMLButtonElement>('export').disabled = !hasAny;
  $<HTMLButtonElement>('share').disabled = !hasAny;
}

async function gated(feature: string, run: () => Promise<void>): Promise<void> {
  if (await hasFeature(feature)) return run();
  setStatus($('status'), `${PRODUCT.proLabel} feature — start a free trial or upgrade.`, 'error');
  openExtensionPage('popup/upgrade.html');
}

async function exportMarkdown(): Promise<void> {
  if (!page) return;
  await navigator.clipboard.writeText(toMarkdown(page));
  setStatus($('status'), 'Markdown copied to clipboard.', 'ok');
}

async function share(): Promise<void> {
  if (!page) return;
  setStatus($('status'), 'Publishing...');
  const result = await publish(page);
  if (!result.ok) {
    const message =
      result.reason === 'not-entitled'
        ? `Sharing needs an active ${PRODUCT.proLabel} license.`
        : result.reason === 'too-large'
          ? 'Too many highlights to share from one page.'
          : 'Could not reach the share service. Try again.';
    setStatus($('status'), message, 'error');
    return;
  }
  await navigator.clipboard.writeText(result.url);
  setStatus($('status'), `Link copied: ${result.url}`, 'ok');
}

async function init(): Promise<void> {
  setProductName();
  const url = await currentTabUrl();
  page = url ? await loadPage(url) : null;
  renderTier(await getEntitlementStatus());
  renderHighlights();
  await renderQuota();

  $('export').addEventListener('click', () => void gated(FEATURE.exportMarkdown, exportMarkdown));
  $('share').addEventListener('click', () => void gated(FEATURE.share, share));
  $('upgrade').addEventListener('click', () => openExtensionPage('popup/upgrade.html'));
  $('settings').addEventListener('click', () => openExtensionPage('popup/settings.html'));

  // Server-side confirmation (cheap, rate-limited by lastStatusCheckAt).
  const { checked } = await licenseService.refreshStatusIfStale();
  if (checked) {
    renderTier(await getEntitlementStatus());
    await renderQuota();
  }
}

void init();

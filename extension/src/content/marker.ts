// Marker content script: select text → pick a colour → it stays highlighted on
// every visit. Highlights live in chrome.storage.local (per URL); the popup
// edits the same records and this script re-renders on storage changes.
//
// Content scripts cannot verify licenses themselves, so every gate here asks the
// service worker's `hasFeature` (which reads the verified entitlement).

import { PRODUCT } from '../config';
import { applyAll, describeRange, indexText, MARK_CLASS, UI_ATTR } from '../marker/anchor';
import { COLORS, Color, FEATURE, FREE_COLOR, FREE_HIGHLIGHT_LIMIT, countAllHighlights, loadPage, newId, pageKey, savePage } from '../marker/model';

async function hasFeature(feature: string): Promise<boolean> {
  try {
    const response = (await chrome.runtime.sendMessage({ action: 'hasFeature', feature })) as { allowed?: boolean };
    return response?.allowed === true;
  } catch {
    return false;
  }
}

function openUpgrade(): void {
  void chrome.runtime.sendMessage({ action: 'openUpgrade' });
}

// ---- bubble (the small toolbar shown near a selection or a highlight) --------

const bubble = document.createElement('div');
bubble.className = 'mkr-bubble';
bubble.setAttribute(UI_ATTR, '');
bubble.hidden = true;

function showBubble(rect: DOMRect, children: Node[]): void {
  bubble.replaceChildren(...children);
  bubble.hidden = false;
  if (!bubble.isConnected) document.documentElement.appendChild(bubble);
  const top = rect.top + window.scrollY - bubble.offsetHeight - 8;
  const left = rect.left + window.scrollX + rect.width / 2 - bubble.offsetWidth / 2;
  bubble.style.top = `${Math.max(window.scrollY + 4, top)}px`;
  bubble.style.left = `${Math.max(4, Math.min(left, window.scrollX + window.innerWidth - bubble.offsetWidth - 4))}px`;
}

function hideBubble(): void {
  bubble.hidden = true;
}

function button(label: string, title: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `mkr-btn ${className}`.trim();
  b.textContent = label;
  b.title = title;
  b.addEventListener('mousedown', e => e.preventDefault()); // keep the selection
  b.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return b;
}

function swatch(color: Color, locked: boolean, onPick: (color: Color) => void): HTMLButtonElement {
  const b = button('', locked ? `${color} — ${PRODUCT.proLabel}` : `Highlight ${color}`, () => onPick(color), 'mkr-swatch');
  b.dataset.mkrColor = color;
  if (locked) b.classList.add('mkr-locked');
  return b;
}

function note(text: string, action?: HTMLElement): HTMLElement {
  const span = document.createElement('span');
  span.className = 'mkr-note';
  span.textContent = text;
  if (action) span.append(' ', action);
  return span;
}

// ---- creating highlights -----------------------------------------------------

async function addHighlight(range: Range, color: Color): Promise<void> {
  const index = indexText();
  const quote = describeRange(range, index);
  if (!quote) return;

  const [unlimited, colors] = await Promise.all([hasFeature(FEATURE.unlimited), hasFeature(FEATURE.colors)]);
  const used = await countAllHighlights();
  if (!unlimited && used >= FREE_HIGHLIGHT_LIMIT) {
    const upgrade = button(`Upgrade to ${PRODUCT.proLabel}`, 'Unlimited highlights', openUpgrade, 'mkr-primary');
    showBubble(range.getBoundingClientRect(), [note(`Free plan: ${FREE_HIGHLIGHT_LIMIT} highlights.`, upgrade)]);
    return;
  }
  if (!colors && color !== FREE_COLOR) {
    const upgrade = button(`Upgrade to ${PRODUCT.proLabel}`, 'All colours', openUpgrade, 'mkr-primary');
    showBubble(range.getBoundingClientRect(), [note(`Colours are a ${PRODUCT.proLabel} feature.`, upgrade)]);
    return;
  }

  const page = await loadPage(location.href);
  page.title = document.title;
  page.highlights.push({ id: newId(), color, createdAt: Date.now(), ...quote });
  await savePage(page); // storage.onChanged re-renders
  window.getSelection()?.removeAllRanges();
  hideBubble();
}

async function onSelection(): Promise<void> {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (bubble.contains(range.commonAncestorContainer)) return;
  if (!range.toString().trim()) return;

  const colors = await hasFeature(FEATURE.colors);
  const pick = (color: Color) => void addHighlight(range.cloneRange(), color);
  showBubble(
    range.getBoundingClientRect(),
    COLORS.map(color => swatch(color, !colors && color !== FREE_COLOR, pick))
  );
}

// ---- existing highlights -----------------------------------------------------

async function removeHighlight(id: string): Promise<void> {
  const page = await loadPage(location.href);
  page.highlights = page.highlights.filter(h => h.id !== id);
  await savePage(page);
  hideBubble();
}

async function recolor(id: string, color: Color): Promise<void> {
  if (!(await hasFeature(FEATURE.colors))) {
    openUpgrade();
    return;
  }
  const page = await loadPage(location.href);
  const h = page.highlights.find(x => x.id === id);
  if (h) h.color = color;
  await savePage(page);
  hideBubble();
}

async function onMarkClick(mark: HTMLElement): Promise<void> {
  const id = mark.dataset.mkrId;
  if (!id) return;
  const colors = await hasFeature(FEATURE.colors);
  const children: Node[] = COLORS.map(color => swatch(color, !colors && color !== FREE_COLOR, c => void recolor(id, c)));
  children.push(button('Remove', 'Remove highlight', () => void removeHighlight(id), 'mkr-remove'));
  showBubble(mark.getBoundingClientRect(), children);
}

async function render(): Promise<void> {
  const page = await loadPage(location.href);
  applyAll(page.highlights);
}

// ---- wiring ------------------------------------------------------------------

document.addEventListener('mouseup', event => {
  if (bubble.contains(event.target as Node)) return;
  const mark = (event.target as Element).closest?.(`mark.${MARK_CLASS}`);
  // Let the selection settle before reading it.
  setTimeout(() => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) void onSelection();
    else if (mark instanceof HTMLElement) void onMarkClick(mark);
    else hideBubble();
  }, 0);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') hideBubble();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && pageKey(location.href) in changes) void render();
});

void render();

// Marker's product model: what a highlight is, where it is stored, and the one
// number the free plan is gated on. Licensing itself lives in ../licensing; this
// file only names the features it asks about.

export const FEATURE = {
  highlight: 'highlight',
  unlimited: 'unlimitedHighlights',
  colors: 'colors',
  exportMarkdown: 'exportMarkdown',
  share: 'share'
} as const;

/** Highlights a free install may keep across all pages before Pro is required. */
export const FREE_HIGHLIGHT_LIMIT = 10;

export const COLORS = ['yellow', 'green', 'pink', 'blue'] as const;
export type Color = (typeof COLORS)[number];
export const FREE_COLOR: Color = 'yellow';

export interface Highlight {
  id: string;
  text: string;
  /** Up to 32 characters of page text before/after, used to re-anchor the quote. */
  prefix: string;
  suffix: string;
  color: Color;
  createdAt: number;
}

export interface PageHighlights {
  url: string;
  title: string;
  highlights: Highlight[];
}

const KEY_PREFIX = 'marker:page:';

export function isColor(value: unknown): value is Color {
  return typeof value === 'string' && (COLORS as readonly string[]).includes(value);
}

/** Highlights are keyed by URL without the fragment; the hash rarely changes the text. */
export function pageKey(url: string): string {
  const u = new URL(url);
  u.hash = '';
  return KEY_PREFIX + u.toString();
}

export function isPageKey(key: string): boolean {
  return key.startsWith(KEY_PREFIX);
}

export async function loadPage(url: string): Promise<PageHighlights> {
  const key = pageKey(url);
  const stored = (await chrome.storage.local.get([key]))[key] as PageHighlights | undefined;
  return stored ?? { url: key.slice(KEY_PREFIX.length), title: '', highlights: [] };
}

export async function savePage(page: PageHighlights): Promise<void> {
  const key = pageKey(page.url);
  if (page.highlights.length === 0) await chrome.storage.local.remove([key]);
  else await chrome.storage.local.set({ [key]: page });
}

export async function loadAllPages(): Promise<PageHighlights[]> {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => isPageKey(key))
    .map(([, page]) => page as PageHighlights);
}

export async function countAllHighlights(): Promise<number> {
  return (await loadAllPages()).reduce((n, page) => n + page.highlights.length, 0);
}

export function newId(): string {
  return 'h_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function toMarkdown(page: PageHighlights): string {
  const lines = [`# ${page.title || page.url}`, '', `Source: ${page.url}`, ''];
  for (const h of page.highlights) lines.push(`> ${h.text.replace(/\s+/g, ' ').trim()}`, '');
  return lines.join('\n');
}

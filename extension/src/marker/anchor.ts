// Text-quote anchoring: a highlight is stored as the quoted text plus a little
// context on each side, and re-found on the next visit by searching the page's
// text. No DOM paths, so it survives markup changes as long as the words do.

import type { Color, Highlight } from './model';

const CONTEXT = 32;
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'SVG', 'IFRAME']);

export const MARK_CLASS = 'mkr-hl';
export const UI_ATTR = 'data-mkr-ui';

interface TextIndex {
  nodes: Text[];
  starts: number[];
  text: string;
}

function isSkipped(node: Node): boolean {
  let el: Node | null = node.parentNode;
  while (el && el !== document.body) {
    if (el instanceof Element && (SKIP.has(el.tagName) || el.hasAttribute(UI_ATTR))) return true;
    el = el.parentNode;
  }
  return false;
}

export function indexText(root: Node = document.body): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (!node.data || isSkipped(node)) continue;
    nodes.push(node);
    starts.push(text.length);
    text += node.data;
  }
  return { nodes, starts, text };
}

function offsetOf(index: TextIndex, node: Text, offset: number): number {
  return index.starts[index.nodes.indexOf(node)] + offset;
}

/** Quote + context for a live selection, or null when it selects no page text. */
export function describeRange(range: Range, index: TextIndex): Pick<Highlight, 'text' | 'prefix' | 'suffix'> | null {
  let start = -1;
  let end = -1;
  for (const node of index.nodes) {
    if (!range.intersectsNode(node)) continue;
    if (start < 0) start = offsetOf(index, node, node === range.startContainer ? range.startOffset : 0);
    end = offsetOf(index, node, node === range.endContainer ? range.endOffset : node.data.length);
  }
  if (start < 0 || end <= start) return null;
  const text = index.text.slice(start, end);
  if (!text.trim()) return null;
  return { text, prefix: index.text.slice(Math.max(0, start - CONTEXT), start), suffix: index.text.slice(end, end + CONTEXT) };
}

function overlap(a: string, b: string, fromEnd: boolean): number {
  let n = 0;
  while (n < a.length && n < b.length) {
    const ca = fromEnd ? a[a.length - 1 - n] : a[n];
    const cb = fromEnd ? b[b.length - 1 - n] : b[n];
    if (ca !== cb) break;
    n++;
  }
  return n;
}

/** Character offset of the best occurrence of the quote, or -1 when it is gone. */
export function locate(h: Pick<Highlight, 'text' | 'prefix' | 'suffix'>, index: TextIndex): number {
  let best = -1;
  let bestScore = -1;
  for (let at = index.text.indexOf(h.text); at >= 0; at = index.text.indexOf(h.text, at + 1)) {
    const before = index.text.slice(Math.max(0, at - CONTEXT), at);
    const after = index.text.slice(at + h.text.length, at + h.text.length + CONTEXT);
    const score = overlap(before, h.prefix, true) + overlap(after, h.suffix, false);
    if (score > bestScore) {
      best = at;
      bestScore = score;
    }
  }
  return best;
}

function splitAt(index: TextIndex, offset: number): number {
  // Returns the position in index.nodes where a node boundary now sits at `offset`.
  let i = index.starts.findIndex((s, k) => offset >= s && offset < s + index.nodes[k].data.length);
  if (i < 0) return index.nodes.length;
  const within = offset - index.starts[i];
  if (within > 0) {
    const tail = index.nodes[i].splitText(within);
    index.nodes.splice(i + 1, 0, tail);
    index.starts.splice(i + 1, 0, offset);
    i += 1;
  }
  return i;
}

/** Wraps the quote at `offset` in <mark> elements; mutates `index` to stay in sync. */
export function wrap(index: TextIndex, offset: number, length: number, id: string, color: Color): void {
  const first = splitAt(index, offset);
  const last = splitAt(index, offset + length);
  for (let i = first; i < last; i++) {
    const node = index.nodes[i];
    if (!node.data.trim() || !node.parentNode) continue;
    const mark = document.createElement('mark');
    mark.className = MARK_CLASS;
    mark.dataset.mkrId = id;
    mark.dataset.mkrColor = color;
    node.parentNode.insertBefore(mark, node);
    mark.appendChild(node);
  }
}

export function unwrapAll(root: ParentNode = document): void {
  for (const mark of root.querySelectorAll(`mark.${MARK_CLASS}`)) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
}

/** Re-applies stored highlights; returns the ids that could not be found. */
export function applyAll(highlights: Highlight[]): string[] {
  unwrapAll();
  const index = indexText();
  const missing: string[] = [];
  for (const h of highlights) {
    const at = locate(h, index);
    if (at < 0) missing.push(h.id);
    else wrap(index, at, h.text.length, h.id, h.color);
  }
  return missing;
}

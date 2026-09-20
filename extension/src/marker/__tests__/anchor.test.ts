import { applyAll, describeRange, indexText, locate, MARK_CLASS, unwrapAll, wrap } from '../anchor';
import type { Highlight } from '../model';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function rangeOver(node: Text, start: number, end: number): Range {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

function highlight(partial: Partial<Highlight> & Pick<Highlight, 'text'>): Highlight {
  return { id: 'h_1', prefix: '', suffix: '', color: 'yellow', createdAt: 0, ...partial };
}

describe('text-quote anchoring', () => {
  beforeEach(() => setBody(''));

  it('indexes visible text and skips scripts, styles and our own UI', () => {
    setBody('<p>Hello <b>world</b></p><script>var x = 1;</script><style>p{}</style><div data-mkr-ui="">bubble</div>');
    expect(indexText().text).toBe('Hello world');
  });

  it('describes a selection with surrounding context', () => {
    setBody('<p>The quick brown fox jumps over the lazy dog.</p>');
    const index = indexText();
    const node = index.nodes[0];
    const quote = describeRange(rangeOver(node, 10, 19), index);
    expect(quote).toEqual({ text: 'brown fox', prefix: 'The quick ', suffix: ' jumps over the lazy dog.' });
  });

  it('spans element boundaries', () => {
    setBody('<p>one <em>two</em> three</p>');
    const index = indexText();
    const range = document.createRange();
    range.setStart(index.nodes[0], 2);
    range.setEnd(index.nodes[2], 4);
    expect(describeRange(range, index)?.text).toBe('e two thr');
  });

  it('returns null for whitespace-only selections', () => {
    setBody('<p>a   b</p>');
    const index = indexText();
    expect(describeRange(rangeOver(index.nodes[0], 1, 4), index)).toBeNull();
  });

  it('locates the occurrence whose context matches best', () => {
    setBody('<p>cat sat. dog sat. bird sat.</p>');
    const index = indexText();
    expect(locate({ text: 'sat', prefix: 'dog ', suffix: '. bird' }, index)).toBe(13);
    expect(locate({ text: 'sat', prefix: 'bird ', suffix: '.' }, index)).toBe(23);
    expect(locate({ text: 'missing', prefix: '', suffix: '' }, index)).toBe(-1);
  });

  it('wraps a quote across nodes and unwraps cleanly', () => {
    setBody('<p>one <em>two</em> three</p>');
    const index = indexText();
    wrap(index, 2, 9, 'h_1', 'green');
    const marks = document.querySelectorAll(`mark.${MARK_CLASS}`);
    expect(marks).toHaveLength(3);
    expect([...marks].map(m => m.textContent).join('')).toBe('e two thr');
    expect(marks[0].getAttribute('data-mkr-color')).toBe('green');
    expect(document.body.textContent).toBe('one two three');

    unwrapAll();
    expect(document.querySelectorAll('mark')).toHaveLength(0);
    expect(document.body.innerHTML).toBe('<p>one <em>two</em> three</p>');
  });

  it('applyAll re-anchors stored highlights and reports the missing ones', () => {
    setBody('<article><h1>Title</h1><p>First paragraph here.</p><p>Second paragraph here.</p></article>');
    const missing = applyAll([
      highlight({ id: 'a', text: 'paragraph', prefix: 'Second ', suffix: ' here.' }),
      highlight({ id: 'b', text: 'Title', color: 'pink' }),
      highlight({ id: 'gone', text: 'not on this page' })
    ]);
    expect(missing).toEqual(['gone']);
    const a = document.querySelector('mark[data-mkr-id="a"]') as HTMLElement;
    expect(a.parentElement?.textContent).toBe('Second paragraph here.');
    expect(document.querySelector('mark[data-mkr-id="b"]')?.getAttribute('data-mkr-color')).toBe('pink');

    // Re-applying is idempotent: marks are rebuilt, never nested.
    applyAll([highlight({ id: 'b', text: 'Title' })]);
    expect(document.querySelectorAll('mark')).toHaveLength(1);
  });
});

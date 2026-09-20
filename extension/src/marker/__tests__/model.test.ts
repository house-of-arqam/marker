import { countAllHighlights, loadAllPages, loadPage, pageKey, savePage, toMarkdown } from '../model';

describe('highlight storage', () => {
  it('keys pages by URL without the fragment', () => {
    expect(pageKey('https://a.example/x?y=1#frag')).toBe('marker:page:https://a.example/x?y=1');
    expect(pageKey('https://a.example/x')).toBe(pageKey('https://a.example/x#other'));
  });

  it('saves, loads, counts across pages and removes empty pages', async () => {
    expect(await loadPage('https://a.example/')).toEqual({ url: 'https://a.example/', title: '', highlights: [] });
    const h = { id: 'h_1', text: 'quote', prefix: '', suffix: '', color: 'yellow' as const, createdAt: 1 };
    await savePage({ url: 'https://a.example/', title: 'A', highlights: [h] });
    await savePage({ url: 'https://b.example/', title: 'B', highlights: [h, { ...h, id: 'h_2' }] });
    expect((await loadPage('https://a.example/#x')).highlights).toHaveLength(1);
    expect(await countAllHighlights()).toBe(3);
    expect((await loadAllPages()).map(p => p.url).sort()).toEqual(['https://a.example/', 'https://b.example/']);

    await savePage({ url: 'https://a.example/', title: 'A', highlights: [] });
    expect(await countAllHighlights()).toBe(2);
    expect((await chrome.storage.local.get(null))[pageKey('https://a.example/')]).toBeUndefined();
  });

  it('exports Markdown with one quote per highlight', () => {
    const md = toMarkdown({
      url: 'https://a.example/',
      title: 'A page',
      highlights: [
        { id: '1', text: 'first\n  line', prefix: '', suffix: '', color: 'yellow', createdAt: 0 },
        { id: '2', text: 'second', prefix: '', suffix: '', color: 'blue', createdAt: 0 }
      ]
    });
    expect(md).toBe('# A page\n\nSource: https://a.example/\n\n> first line\n\n> second\n');
  });
});

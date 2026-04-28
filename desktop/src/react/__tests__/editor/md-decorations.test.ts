import { describe, expect, it } from 'vitest';
import { collectLivePreviewRanges } from '../../editor/md-decorations';

describe('collectLivePreviewRanges', () => {
  it('collects Obsidian highlights and math ranges on inactive lines', () => {
    const ranges = collectLivePreviewRanges([
      'GDP ==平减指数== and $x+1$',
      '$$',
      'y^2',
      '$$',
      '<span style="background:#fff88f">高亮</span>',
    ].join('\n'), new Set());

    expect(ranges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'mark', text: '平减指数' }),
      expect.objectContaining({ kind: 'inlineMath', source: 'x+1' }),
      expect.objectContaining({ kind: 'blockMath', source: 'y^2' }),
      expect.objectContaining({ kind: 'mark', text: '高亮', color: '#fff88f' }),
    ]));
  });

  it('skips live preview ranges on active lines so the source remains editable', () => {
    const ranges = collectLivePreviewRanges('GDP ==平减指数== and $x+1$', new Set([1]));

    expect(ranges).toEqual([]);
  });

  it('does not collect math or highlight ranges inside code blocks', () => {
    const ranges = collectLivePreviewRanges([
      '```js',
      'const price = "$x+1$"; // ==keep raw==',
      '```',
    ].join('\n'), new Set());

    expect(ranges).toEqual([]);
  });

  it('does not collect math or highlight ranges inside inline code', () => {
    const ranges = collectLivePreviewRanges('Use `$x+1$` and `==raw==` outside ==mark==', new Set());

    expect(ranges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'mark', text: 'mark' }),
    ]));
    expect(ranges).toHaveLength(3);
  });
});

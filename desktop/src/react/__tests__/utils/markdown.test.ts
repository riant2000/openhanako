import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../utils/markdown';

describe('renderMarkdown', () => {
  it('renders inline and block KaTeX math', () => {
    const html = renderMarkdown('inline $x+1$\n\n$$\ny^2\n$$');

    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
  });

  it('renders LaTeX parenthesis and bracket math delimiters', () => {
    const html = renderMarkdown('inline \\(x+1\\)\n\n\\[\ny^2\n\\]');

    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
    expect(html).not.toContain('\\(x+1\\)');
    expect(html).not.toContain('\\[');
  });

  it('renders Obsidian ==highlight== syntax as mark', () => {
    const html = renderMarkdown('GDP ==平减指数==');

    expect(html).toContain('<mark>平减指数</mark>');
  });

  it('renders whitelisted Obsidian background span as a safe mark', () => {
    const html = renderMarkdown('<span style="background:#fff88f">GDP平减指数</span>');

    expect(html).toContain('<mark style="background-color:#fff88f">GDP平减指数</mark>');
  });

  it('keeps non-whitelisted span markup escaped', () => {
    const html = renderMarkdown('<span onclick="alert(1)">bad</span>');

    expect(html).toContain('&lt;span onclick=');
    expect(html).toContain('bad&lt;/span&gt;');
    expect(html).not.toContain('<span onclick=');
  });
});

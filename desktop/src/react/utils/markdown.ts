/**
 * Markdown 渲染器
 *
 * 通过 npm import 使用 markdown-it，不依赖全局 window.markdownit。
 */

import markdownit from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import mk from '@traptitech/markdown-it-katex';
import taskLists from 'markdown-it-task-lists';
import 'katex/dist/katex.min.css';

type MarkdownItInstance = ReturnType<typeof markdownit>;

let _md: MarkdownItInstance | null = null;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?$/;
const RGB_COLOR_RE = /^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
const BG_SPAN_RE = /^<span\s+style=(["'])\s*background(?:-color)?\s*:\s*([^;"']+)\s*;?\s*\1>([\s\S]*?)<\/span>/i;

function normalizeSafeBackgroundColor(raw: string): string | null {
  const color = raw.trim();
  if (HEX_COLOR_RE.test(color)) return color;
  if (RGB_COLOR_RE.test(color)) return color;
  return null;
}

function tokenizeInner(state: StateInline, from: number, to: number): void {
  const oldPos = state.pos;
  const oldMax = state.posMax;
  state.pos = from;
  state.posMax = to;
  state.md.inline.tokenize(state);
  state.pos = oldPos;
  state.posMax = oldMax;
}

function obsidianHighlights(md: MarkdownItInstance): void {
  md.inline.ruler.before('emphasis', 'obsidian_mark', (state, silent) => {
    const start = state.pos;
    if (state.src.slice(start, start + 2) !== '==') return false;
    const end = state.src.indexOf('==', start + 2);
    if (end < 0 || end === start + 2) return false;

    if (!silent) {
      state.push('mark_open', 'mark', 1);
      tokenizeInner(state, start + 2, end);
      state.push('mark_close', 'mark', -1);
    }
    state.pos = end + 2;
    return true;
  });

  md.inline.ruler.before('text', 'obsidian_background_span', (state, silent) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x3C) return false; // <
    const match = BG_SPAN_RE.exec(state.src.slice(start));
    if (!match) return false;
    const color = normalizeSafeBackgroundColor(match[2]);
    if (!color) return false;

    if (!silent) {
      const open = state.push('mark_open', 'mark', 1);
      open.attrSet('style', `background-color:${color}`);
      const innerStart = start + match[0].indexOf('>') + 1;
      const innerEnd = start + match[0].length - '</span>'.length;
      tokenizeInner(state, innerStart, innerEnd);
      state.push('mark_close', 'mark', -1);
    }
    state.pos = start + match[0].length;
    return true;
  });
}

/** 获取默认 md 实例（html: false, katex 插件） */
export function getMd(): MarkdownItInstance {
  if (_md) return _md;
  _md = markdownit({
    html: false,
    breaks: true,
    linkify: true,
    typographer: true,
  });
  _md.use(mk);
  _md.use(taskLists, { enabled: false, label: true });
  _md.use(obsidianHighlights);
  return _md;
}

const _cache = new Map<string, MarkdownItInstance>();

/** 获取自定义选项的 md 实例（缓存复用） */
export function getMdWithOpts(opts: Parameters<typeof markdownit>[0]): MarkdownItInstance {
  const key = JSON.stringify(opts);
  let inst = _cache.get(key);
  if (!inst) {
    inst = markdownit(opts);
    _cache.set(key, inst);
  }
  return inst;
}

export function renderMarkdown(src: string): string {
  return getMd().render(src);
}

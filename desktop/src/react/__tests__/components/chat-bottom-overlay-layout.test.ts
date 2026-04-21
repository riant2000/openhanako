import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

function read(relPath: string) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('chat bottom overlay layout', () => {
  it('session panel cuts off at input area midline so truncation falls inside the input card', () => {
    const styleSource = read('components/chat/Chat.module.css');

    expect(styleSource).toMatch(
      /\.sessionPanel\s*\{[\s\S]*bottom:\s*calc\(var\(--input-area-h,\s*0px\)\s*\/\s*2\);/,
    );
  });

  it('session footer leaves one extra line of breathing room above the input top edge', () => {
    const styleSource = read('components/chat/Chat.module.css');

    expect(styleSource).toMatch(
      /\.sessionFooter\s*\{[\s\S]*height:\s*calc\(var\(--input-area-h,\s*0px\)\s*\/\s*2\s*\+\s*3\.5rem\);/,
    );
  });
});

/**
 * CI-level safety net: every OpenHanako tool defined in lib/tools/ and
 * lib/memory/ must be categorized in shared/tool-categories.js.
 *
 * We scan source statically (no engine boot needed) and feed the extracted
 * name list into assertAllToolsCategorized. Any uncategorized tool fails
 * this test with an actionable error message.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAllToolsCategorized } from "../shared/tool-categories.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function extractToolNamesFromDir(dir) {
  const names = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".js")) continue;
    const src = readFileSync(join(dir, file), "utf8");
    for (const match of src.matchAll(/name:\s*["']([a-z_][a-z0-9_]*)["']/g)) {
      names.push(match[1]);
    }
  }
  return names;
}

describe("tool-categorization smoke", () => {
  it("every tool name declared under lib/tools/ and lib/memory/ is categorized", () => {
    const toolsDir = resolve(__dirname, "../lib/tools");
    const memoryDir = resolve(__dirname, "../lib/memory");
    const all = new Set([
      ...extractToolNamesFromDir(toolsDir),
      ...extractToolNamesFromDir(memoryDir),
    ]);
    const names = [...all];
    expect(names.length).toBeGreaterThan(15); // sanity: we should see all 20-ish tools
    expect(() => assertAllToolsCategorized(names)).not.toThrow();
  });
});

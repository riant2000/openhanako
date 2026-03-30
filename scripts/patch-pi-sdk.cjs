/**
 * patch-pi-sdk.cjs — postinstall 补丁
 *
 * 两个 patch：
 *   1. createAgentSession() → baseToolsOverride 透传（sdk.js）
 *   2. 空 tools 数组剥离（openai-completions.js）
 *
 * 安全机制：
 *   - 版本白名单守卫：未验证版本直接中断 npm install
 *   - 结构验证：patch 后回读确认生效
 *   - 直接引用扫描：检测绕过 adapter 的 SDK 导入
 *
 * See: https://github.com/anthropics/openhanako/issues/221
 */

const fs = require("fs");
const path = require("path");

const sdkRoot = path.join(__dirname, "..", "node_modules", "@mariozechner", "pi-coding-agent");
const piAiRoot = path.join(__dirname, "..", "node_modules", "@mariozechner", "pi-ai");

// ── 版本守卫 ──

const VERIFIED_VERSIONS = ["0.64.0"];

if (!fs.existsSync(sdkRoot)) {
  console.log("[patch-pi-sdk] SDK not installed, skipping");
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(path.join(sdkRoot, "package.json"), "utf8"));
if (!VERIFIED_VERSIONS.includes(pkg.version)) {
  console.error(
    `[patch-pi-sdk] SDK 版本 ${pkg.version} 未经验证。\n` +
    `已验证版本：${VERIFIED_VERSIONS.join(", ")}。\n` +
    `请先测试 patch 兼容性再添加到 VERIFIED_VERSIONS。`
  );
  process.exit(1);
}

// ── Patch 1: baseToolsOverride 透传 ──

const sdkTarget = path.join(sdkRoot, "dist", "core", "sdk.js");
let sdkCode = fs.readFileSync(sdkTarget, "utf8");

if (sdkCode.includes("baseToolsOverride")) {
  console.log("[patch-pi-sdk] patch 1 already applied, skipping");
} else {
  const needle = "        initialActiveToolNames,\n        extensionRunnerRef,";
  const replacement =
    "        initialActiveToolNames,\n" +
    "        baseToolsOverride: options.tools\n" +
    "            ? Object.fromEntries(options.tools.map(t => [t.name, t]))\n" +
    "            : undefined,\n" +
    "        extensionRunnerRef,";

  if (!sdkCode.includes(needle)) {
    console.error("[patch-pi-sdk] patch 1 needle not found — sdk.js structure changed");
    process.exit(1);
  }

  sdkCode = sdkCode.replace(needle, replacement);
  fs.writeFileSync(sdkTarget, sdkCode, "utf8");
  console.log("[patch-pi-sdk] patch 1 applied: baseToolsOverride wired through");
}

// 验证 patch 1
const verifiedSdk = fs.readFileSync(sdkTarget, "utf8");
if (!verifiedSdk.includes("baseToolsOverride")) {
  console.error("[patch-pi-sdk] patch 1 verification failed: baseToolsOverride not found after patching");
  process.exit(1);
}

// ── Patch 2: 空 tools 数组剥离 ──

const completionsTarget = path.join(piAiRoot, "dist", "providers", "openai-completions.js");

if (!fs.existsSync(completionsTarget)) {
  console.error("[patch-pi-sdk] openai-completions.js not found");
  process.exit(1);
}

let completionsCode = fs.readFileSync(completionsTarget, "utf8");

if (completionsCode.includes("/* patched: strip empty tools */")) {
  console.log("[patch-pi-sdk] patch 2 already applied, skipping");
} else {
  const toolsNeedle = '        params.tools = [];\n    }\n    if (options?.toolChoice) {';
  const toolsReplacement =
    '        params.tools = [];\n    }\n' +
    '    /* patched: strip empty tools */\n' +
    '    if (Array.isArray(params.tools) && params.tools.length === 0) {\n' +
    '        delete params.tools;\n' +
    '    }\n' +
    '    if (options?.toolChoice) {';

  if (!completionsCode.includes(toolsNeedle)) {
    console.error("[patch-pi-sdk] patch 2 needle not found — openai-completions.js structure changed");
    process.exit(1);
  }

  completionsCode = completionsCode.replace(toolsNeedle, toolsReplacement);
  fs.writeFileSync(completionsTarget, completionsCode, "utf8");
  console.log("[patch-pi-sdk] patch 2 applied: strip empty tools array");
}

// 验证 patch 2
const verifiedCompletions = fs.readFileSync(completionsTarget, "utf8");
if (!verifiedCompletions.includes("/* patched: strip empty tools */")) {
  console.error("[patch-pi-sdk] patch 2 verification failed");
  process.exit(1);
}

// ── 直接引用扫描 ──
// 检测 lib/pi-sdk/ 之外是否有文件直接 import "@mariozechner/"

const SCAN_DIRS = ["core", "server", "lib", "hub"].map(d => path.join(__dirname, "..", d));
const ADAPTER_DIR = path.join(__dirname, "..", "lib", "pi-sdk");
const SDK_PATTERN = /@mariozechner\//;
let leaks = 0;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === ADAPTER_DIR || entry.name === "node_modules") continue;
      scanDir(full);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      const content = fs.readFileSync(full, "utf8");
      if (SDK_PATTERN.test(content)) {
        console.warn(`[patch-pi-sdk] WARN: direct SDK reference in ${path.relative(path.join(__dirname, ".."), full)}`);
        leaks++;
      }
    }
  }
}

for (const d of SCAN_DIRS) scanDir(d);
if (leaks > 0) {
  console.warn(`[patch-pi-sdk] ${leaks} file(s) bypass adapter — migrate to lib/pi-sdk/index.js`);
}

console.log("[patch-pi-sdk] all patches verified ✓");

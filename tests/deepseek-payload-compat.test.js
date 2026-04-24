import { describe, expect, it } from "vitest";
import {
  normalizeDeepSeekChatPayload,
  isDeepSeekModel,
} from "../core/deepseek-payload-compat.js";

describe("isDeepSeekModel", () => {
  it("只把官方 DeepSeek provider / baseUrl 视为 DeepSeek 兼容路径", () => {
    expect(isDeepSeekModel({ provider: "deepseek" })).toBe(true);
    expect(isDeepSeekModel({ baseUrl: "https://api.deepseek.com/v1" })).toBe(true);
    expect(isDeepSeekModel({ provider: "openrouter", id: "deepseek/deepseek-v3.2" })).toBe(false);
  });
});

describe("normalizeDeepSeekChatPayload", () => {
  const deepseekModel = {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    reasoning: true,
    maxTokens: 384000,
  };

  it("非 DeepSeek 模型不改 payload", () => {
    const payload = {
      model: "gpt-5.4",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "medium",
      max_completion_tokens: 32000,
    };

    expect(normalizeDeepSeekChatPayload(payload, { provider: "openai", reasoning: true }))
      .toBe(payload);
  });

  it("DeepSeek 无工具思考请求使用官方 max_tokens，并抬过 high thinking budget", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "medium",
      max_completion_tokens: 32000,
    };

    const result = normalizeDeepSeekChatPayload(payload, deepseekModel);

    expect(result).not.toBe(payload);
    expect(result).toMatchObject({
      model: "deepseek-v4-pro",
      reasoning_effort: "high",
      max_tokens: 65536,
    });
    expect(result).not.toHaveProperty("max_completion_tokens");
    expect(payload).toHaveProperty("max_completion_tokens", 32000);
  });

  it("DeepSeek 已经足够大的 max_tokens 不被放大", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "high",
      max_tokens: 50000,
    };

    const result = normalizeDeepSeekChatPayload(payload, deepseekModel);

    expect(result.max_tokens).toBe(50000);
  });

  it("DeepSeek 工具请求关闭思考协议，并移除历史 reasoning_content", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [
        { role: "user", content: "look up date" },
        {
          role: "assistant",
          content: null,
          reasoning_content: "Need to call the date tool.",
          tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
        },
        { role: "tool", tool_call_id: "call_1", content: "2026-04-24" },
      ],
      tools: [{ type: "function", function: { name: "date", parameters: { type: "object" } } }],
      reasoning_effort: "medium",
      max_completion_tokens: 32000,
    };

    const result = normalizeDeepSeekChatPayload(payload, deepseekModel);

    expect(result).toMatchObject({
      thinking: { type: "disabled" },
      max_tokens: 32000,
    });
    expect(result).not.toHaveProperty("reasoning_effort");
    expect(result).not.toHaveProperty("max_completion_tokens");
    expect(result.messages[1]).not.toHaveProperty("reasoning_content");
    expect(payload.messages[1]).toHaveProperty("reasoning_content");
  });

  it("DeepSeek v4 即使缺少本地 reasoning 标记，也按默认思考模式防护", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "look up date" }],
      tools: [{ type: "function", function: { name: "date", parameters: { type: "object" } } }],
    };

    const result = normalizeDeepSeekChatPayload(payload, {
      id: "deepseek-v4-pro",
      provider: "deepseek",
    });

    expect(result).toMatchObject({ thinking: { type: "disabled" } });
  });
});

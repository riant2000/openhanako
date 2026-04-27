import { afterEach, describe, expect, it, vi } from "vitest";
import { callText } from "../core/llm-client.js";

describe("callText provider-compat routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("裸 model id + opts.quirks 仍走 qwen utility 兼容层", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: "ok" } }],
      }),
    });

    await callText({
      api: "openai-completions",
      baseUrl: "https://example.test/v1",
      model: "qwen3.5-plus",
      quirks: ["enable_thinking"],
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 5_000,
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.enable_thinking).toBe(false);
  });

  it("serializes image content for openai-compatible chat completions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: "ok" } }],
      }),
    });

    await callText({
      api: "openai-completions",
      baseUrl: "https://example.test/v1",
      model: { id: "qwen-vl", provider: "dashscope", input: ["text", "image"] },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Describe this image." },
          { type: "image", data: "BASE64", mimeType: "image/png" },
        ],
      }],
      timeoutMs: 5_000,
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Describe this image." },
      { type: "image_url", image_url: { url: "data:image/png;base64,BASE64" } },
    ]);
  });

  it("serializes image content for anthropic messages", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        content: [{ type: "text", text: "ok" }],
      }),
    });

    await callText({
      api: "anthropic-messages",
      baseUrl: "https://example.test",
      model: { id: "claude-sonnet", provider: "anthropic", input: ["text", "image"] },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Describe this image." },
          { type: "image", data: "BASE64", mimeType: "image/jpeg" },
        ],
      }],
      timeoutMs: 5_000,
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Describe this image." },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "BASE64",
        },
      },
    ]);
  });
});

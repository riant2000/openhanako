import { describe, expect, it, vi } from "vitest";
import { generateDescription } from "../core/llm-utils.js";

vi.mock("../core/llm-client.js", () => ({
  callText: vi.fn().mockResolvedValue("温柔细腻的文学型助手，擅长写作、翻译和情感分析，沟通风格亲切自然。"),
}));

describe("generateDescription", () => {
  it("returns a description within 100 chars", async () => {
    const result = await generateDescription(
      { utility: "test-model", api_key: "key", base_url: "http://test", api: "openai" },
      "你是 Hanako，一个温柔的助手...",
      "zh",
    );
    expect(result).toBeTruthy();
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it("returns null when api_key is missing", async () => {
    const result = await generateDescription(
      { utility: "test-model", api_key: "", base_url: "http://test", api: "openai" },
      "personality text",
      "en",
    );
    expect(result).toBeNull();
  });
});

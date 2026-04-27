import { describe, expect, it, vi } from "vitest";
import {
  VisionBridge,
  VISION_CONTEXT_END,
  VISION_CONTEXT_START,
} from "../core/vision-bridge.js";

const image = { type: "image", data: "BASE64", mimeType: "image/png" };
const pathA = "/tmp/upload-a.png";

function makeBridge(callText = vi.fn(async () => [
  "image_overview: A desk screenshot with a red error banner.",
  "user_request_answer: The screenshot shows an error state relevant to the question.",
  "evidence: red banner and visible editor layout.",
  "uncertainty: exact line number is unclear.",
].join("\n"))) {
  return {
    callText,
    bridge: new VisionBridge({
      resolveVisionConfig: () => ({
        model: { id: "qwen-vl", provider: "dashscope", input: ["text", "image"] },
        api: "openai-completions",
        api_key: "sk-test",
        base_url: "https://example.test/v1",
      }),
      callText,
    }),
  };
}

describe("VisionBridge", () => {
  it("analyzes text-only model images and registers notes by attachment path", async () => {
    const { bridge, callText } = makeBridge();

    const result = await bridge.prepare({
      sessionPath: "/tmp/session.jsonl",
      targetModel: { id: "deepseek-chat", provider: "deepseek", input: ["text"] },
      text: `[attached_image: ${pathA}]\nwhat is this?`,
      images: [image],
      imageAttachmentPaths: [pathA],
    });

    expect(callText).toHaveBeenCalledTimes(1);
    expect(callText.mock.calls[0][0].messages[0].content[0].text).toContain("User request");
    expect(callText.mock.calls[0][0].messages[0].content[0].text).toContain("what is this?");
    expect(result.images).toBeUndefined();
    expect(result.text).toContain(`[attached_image: ${pathA}]`);

    const injected = bridge.injectNotes([
      { role: "user", content: [{ type: "text", text: `[attached_image: ${pathA}]\nwhat is this?` }] },
    ], "/tmp/session.jsonl");

    expect(injected.messages[0].content[0].text).toContain(VISION_CONTEXT_START);
    expect(injected.messages[0].content[0].text).toContain("image_overview");
    expect(injected.messages[0].content[0].text).toContain("user_request_answer");
    expect(injected.messages[0].content[0].text).toContain(VISION_CONTEXT_END);
  });

  it("does nothing for image-capable target models", async () => {
    const { bridge, callText } = makeBridge();

    const result = await bridge.prepare({
      sessionPath: "/tmp/session.jsonl",
      targetModel: { id: "gpt-4o", provider: "openai", input: ["text", "image"] },
      text: "what is this?",
      images: [image],
      imageAttachmentPaths: [pathA],
    });

    expect(callText).not.toHaveBeenCalled();
    expect(result.images).toEqual([image]);
  });

  it("fails closed when a text-only target has images but no vision model", async () => {
    const bridge = new VisionBridge({
      resolveVisionConfig: () => null,
      callText: vi.fn(),
    });

    await expect(bridge.prepare({
      sessionPath: "/tmp/session.jsonl",
      targetModel: { id: "deepseek-chat", provider: "deepseek", input: ["text"] },
      text: "what is this?",
      images: [image],
      imageAttachmentPaths: [pathA],
    })).rejects.toThrow(/vision auxiliary model/i);
  });

  it("reuses cached analysis for the same image and same user request", async () => {
    const { bridge, callText } = makeBridge();

    await bridge.prepare({
      sessionPath: "/tmp/a.jsonl",
      targetModel: { id: "deepseek-chat", provider: "deepseek", input: ["text"] },
      text: `[attached_image: ${pathA}]\nwhat is this?`,
      images: [image],
      imageAttachmentPaths: [pathA],
    });
    await bridge.prepare({
      sessionPath: "/tmp/b.jsonl",
      targetModel: { id: "deepseek-chat", provider: "deepseek", input: ["text"] },
      text: "[attached_image: /tmp/other.png]\nwhat is this?",
      images: [image],
      imageAttachmentPaths: ["/tmp/other.png"],
    });

    expect(callText).toHaveBeenCalledTimes(1);
  });

  it("does not reuse cached analysis for a different user request on the same image", async () => {
    const { bridge, callText } = makeBridge();

    await bridge.prepare({
      sessionPath: "/tmp/a.jsonl",
      targetModel: { id: "deepseek-chat", provider: "deepseek", input: ["text"] },
      text: `[attached_image: ${pathA}]\nhow many kittens are there?`,
      images: [image],
      imageAttachmentPaths: [pathA],
    });
    await bridge.prepare({
      sessionPath: "/tmp/b.jsonl",
      targetModel: { id: "deepseek-chat", provider: "deepseek", input: ["text"] },
      text: "[attached_image: /tmp/other.png]\nwhat color is the blanket?",
      images: [image],
      imageAttachmentPaths: ["/tmp/other.png"],
    });

    expect(callText).toHaveBeenCalledTimes(2);
  });

  it("injects notes into only the user message that carries an attached image marker", async () => {
    const { bridge } = makeBridge();
    const targetModel = { id: "deepseek-chat", provider: "deepseek", input: ["text"] };

    await bridge.prepare({
      sessionPath: "/tmp/session.jsonl",
      targetModel,
      text: `[attached_image: ${pathA}]\nfirst question`,
      images: [image],
      imageAttachmentPaths: [pathA],
    });

    const result = bridge.injectNotes([
      { role: "user", content: [{ type: "text", text: `[attached_image: ${pathA}]\nfirst question` }] },
      { role: "assistant", content: [{ type: "text", text: "reply" }] },
      { role: "user", content: [{ type: "text", text: "follow-up" }] },
    ], "/tmp/session.jsonl");

    expect(result.injected).toBe(1);
    expect(result.messages[0].content[0].text).toContain(VISION_CONTEXT_START);
    expect(result.messages[2].content[0].text).toBe("follow-up");
  });
});

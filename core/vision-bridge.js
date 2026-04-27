import crypto from "crypto";
import { callText as defaultCallText } from "./llm-client.js";
import { modelSupportsImage } from "./message-sanitizer.js";

export const VISION_CONTEXT_START = "<vision-context>";
export const VISION_CONTEXT_END = "</vision-context>";

const MAX_NOTE_CHARS = 2400;
const MAX_CACHE_ENTRIES = 256;

function normalizeUserRequest(text) {
  return String(text || "")
    .replace(/\[attached_image:\s*[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function imagePromptCacheKey(img, userRequest) {
  const h = crypto.createHash("sha256");
  h.update(img?.mimeType || "image/png");
  h.update("\0");
  h.update(img?.data || "");
  h.update("\0");
  h.update(userRequest || "");
  return h.digest("hex");
}

function truncate(text, max = MAX_NOTE_CHARS) {
  const s = String(text || "").trim();
  return s.length > max ? `${s.slice(0, max - 20)}\n[truncated]` : s;
}

function hasExplicitTextOnlyInput(model) {
  return Array.isArray(model?.input) && !model.input.includes("image");
}

function uniquePathsFromText(text) {
  const paths = [];
  const re = /\[attached_image:\s*([^\]]+)\]/g;
  let m;
  while ((m = re.exec(text || ""))) paths.push(m[1].trim());
  return paths;
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => block?.type === "text" ? block.text || "" : "")
    .join("\n");
}

function replaceTextContent(content, replacer) {
  if (typeof content === "string") return replacer(content);
  if (!Array.isArray(content)) return content;
  let changed = false;
  const next = content.map((block) => {
    if (block?.type !== "text") return block;
    const text = block.text || "";
    const replaced = replacer(text);
    if (replaced !== text) changed = true;
    return replaced !== text ? { ...block, text: replaced } : block;
  });
  return changed ? next : content;
}

export class VisionBridge {
  constructor({
    resolveVisionConfig,
    callText = defaultCallText,
    now = () => Date.now(),
    maxCacheEntries = MAX_CACHE_ENTRIES,
  } = {}) {
    this._resolveVisionConfig = resolveVisionConfig || (() => null);
    this._callText = callText;
    this._now = now;
    this._maxCacheEntries = maxCacheEntries;
    this._analysisByPrompt = new Map();
    this._noteByPath = new Map();
  }

  async prepare({ sessionPath, targetModel, text, images, imageAttachmentPaths } = {}) {
    if (!images?.length) return { text, images };
    if (!hasExplicitTextOnlyInput(targetModel)) return { text, images };

    const config = this._resolveVisionConfig?.();
    if (!config?.model) {
      throw new Error("vision auxiliary model is required for image input with the current text-only model");
    }
    if (!modelSupportsImage(config.model)) {
      throw new Error("vision auxiliary model must support image input");
    }

    const paths = imageAttachmentPaths?.length ? imageAttachmentPaths : uniquePathsFromText(text);
    const userRequest = normalizeUserRequest(text);
    const notes = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const note = await this._analyzeImage(config, img, i, userRequest);
      const imagePath = paths[i];
      if (imagePath) {
        this._noteByPath.set(imagePath, {
          note,
          sessionPath: sessionPath || null,
          updatedAt: this._now(),
        });
      }
      notes.push(note);
    }

    return { text, images: undefined, visionNotes: notes };
  }

  injectNotes(messages, sessionPath = null) {
    if (!Array.isArray(messages) || this._noteByPath.size === 0) return { messages, injected: 0 };
    let injected = 0;

    const next = messages.map((msg) => {
      if (!msg || typeof msg !== "object") return msg;
      if (msg.role !== "user") return msg;
      const text = contentText(msg.content);
      if (!text || text.includes(VISION_CONTEXT_START)) return msg;
      const paths = uniquePathsFromText(text).filter((p) => {
        const entry = this._noteByPath.get(p);
        return entry && (!sessionPath || !entry.sessionPath || entry.sessionPath === sessionPath);
      });
      if (!paths.length) return msg;

      const noteText = paths.map((p, idx) => {
        const entry = this._noteByPath.get(p);
        return `image_${idx + 1}: ${entry.note}`;
      }).join("\n\n");
      const block = `${VISION_CONTEXT_START}\n${noteText}\n${VISION_CONTEXT_END}\n\n`;

      const replacedContent = replaceTextContent(msg.content, (oldText) => {
        if (!uniquePathsFromText(oldText).some((p) => paths.includes(p))) return oldText;
        injected += paths.length;
        return `${block}${oldText}`;
      });
      return replacedContent === msg.content ? msg : { ...msg, content: replacedContent };
    });

    return { messages: injected ? next : messages, injected };
  }

  async _analyzeImage(config, img, index, userRequest) {
    const key = imagePromptCacheKey(img, userRequest);
    const cached = this._analysisByPrompt.get(key);
    if (cached) {
      cached.lastUsedAt = this._now();
      return cached.note;
    }

    const note = truncate(await this._callText({
      api: config.api,
      apiKey: config.api_key,
      baseUrl: config.base_url,
      model: config.model,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Analyze this image for another text-only model.",
              "Return a concise paper note with these exact sections:",
              "image_overview: fixed basic description of what the image is.",
              "visible_text: important OCR or readable text.",
              "objects_and_layout: important objects, positions, counts, and relationships.",
              "charts_or_data: chart/table/data details if present; otherwise say none.",
              "user_request: restate the user's request in one short sentence.",
              "user_request_answer: answer the user's request using the image when possible.",
              "evidence: the visual evidence supporting that answer.",
              "uncertainty: anything unclear, hidden, or guessed.",
              "Do not mention that you are a tool or a separate model.",
              "",
              `User request:\n${userRequest || "(no explicit text request)"}`,
            ].join("\n"),
          },
          img,
        ],
      }],
      temperature: 0,
      maxTokens: 900,
      timeoutMs: 45_000,
    }));

    this._analysisByPrompt.set(key, {
      note,
      createdAt: this._now(),
      lastUsedAt: this._now(),
      index,
    });
    this._trimCache();
    return note;
  }

  _trimCache() {
    if (this._analysisByPrompt.size <= this._maxCacheEntries) return;
    const entries = [...this._analysisByPrompt.entries()]
      .sort((a, b) => (a[1].lastUsedAt || 0) - (b[1].lastUsedAt || 0));
    for (const [key] of entries.slice(0, this._analysisByPrompt.size - this._maxCacheEntries)) {
      this._analysisByPrompt.delete(key);
    }
  }
}

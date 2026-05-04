import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ws", () => {
  class MockWebSocket {
    static OPEN = 1;
    readyState = 0;
    on() {}
    send() {}
    close() {}
  }
  return { default: MockWebSocket };
});

vi.mock("../lib/debug-log.js", () => ({
  debugLog: () => null,
}));

import { createQQAdapter } from "../lib/bridge/qq-adapter.js";

function jsonResponse(body) {
  return {
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("createQQAdapter media delivery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/app/getAppAccessToken")) {
        return jsonResponse({ access_token: "qq-token", expires_in: 7200 });
      }
      if (href.endsWith("/gateway")) {
        return jsonResponse({ url: "ws://localhost/qq" });
      }
      if (href.includes("/files")) {
        return jsonResponse({ file_info: "file-info" });
      }
      return jsonResponse({});
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects local buffer media with an explicit unsupported error", async () => {
    const adapter = createQQAdapter({
      appID: "app-id",
      appSecret: "app-secret",
      agentId: "hana",
      onMessage: vi.fn(),
    });

    await expect(
      adapter.sendMediaBuffer("chat-1", Buffer.from("png"), {
        mime: "image/png",
        filename: "image.png",
      }),
    ).rejects.toThrow(/QQ.*本地.*公网可访问 URL/);

    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/files"),
      expect.anything(),
    );
    adapter.stop();
  });

  it("uses staged file metadata to choose QQ rich-media image file_type for extensionless URLs", async () => {
    const adapter = createQQAdapter({
      appID: "app-id",
      appSecret: "app-secret",
      agentId: "hana",
      onMessage: vi.fn(),
    });

    await adapter.sendMedia("user-openid", "https://hana.example.com/api/bridge/media/token_123", {
      kind: "image",
      mime: "image/png",
      filename: "image.png",
    });

    const uploadCall = fetch.mock.calls.find(([url]) => String(url).includes("/v2/users/user-openid/files"));
    expect(uploadCall).toBeTruthy();
    expect(JSON.parse(uploadCall[1].body)).toMatchObject({
      file_type: 1,
      url: "https://hana.example.com/api/bridge/media/token_123",
      srv_send_msg: false,
    });
    const messageCall = fetch.mock.calls.find(([url]) => String(url).includes("/v2/users/user-openid/messages"));
    expect(JSON.parse(messageCall[1].body)).toMatchObject({
      msg_type: 7,
      media: { file_info: "file-info" },
    });
    adapter.stop();
  });

  it("sends C2C documents with QQ rich-media file_type 4", async () => {
    const adapter = createQQAdapter({
      appID: "app-id",
      appSecret: "app-secret",
      agentId: "hana",
      onMessage: vi.fn(),
    });

    await adapter.sendMedia("user-openid", "https://cdn.example.com/note.txt", {
      kind: "document",
      mime: "text/plain",
      filename: "note.txt",
    });

    const uploadCall = fetch.mock.calls.find(([url]) => String(url).includes("/v2/users/user-openid/files"));
    expect(uploadCall).toBeTruthy();
    expect(JSON.parse(uploadCall[1].body)).toMatchObject({
      file_type: 4,
      url: "https://cdn.example.com/note.txt",
      srv_send_msg: false,
    });
    adapter.stop();
  });

  it("uses the group rich-media endpoint directly when Bridge knows the target is a group", async () => {
    const adapter = createQQAdapter({
      appID: "app-id",
      appSecret: "app-secret",
      agentId: "hana",
      onMessage: vi.fn(),
    });

    await adapter.sendMedia("group-openid", "https://cdn.example.com/image.png", {
      kind: "image",
      mime: "image/png",
      filename: "image.png",
      isGroup: true,
    });

    expect(fetch.mock.calls.some(([url]) => String(url).includes("/v2/users/group-openid/files"))).toBe(false);
    const uploadCall = fetch.mock.calls.find(([url]) => String(url).includes("/v2/groups/group-openid/files"));
    expect(uploadCall).toBeTruthy();
    expect(JSON.parse(uploadCall[1].body)).toMatchObject({ file_type: 1 });
    adapter.stop();
  });

  it("rejects QQ group documents before upload because the official API has not opened file_type 4 for groups", async () => {
    const adapter = createQQAdapter({
      appID: "app-id",
      appSecret: "app-secret",
      agentId: "hana",
      onMessage: vi.fn(),
    });

    await expect(adapter.sendMedia("group-openid", "https://cdn.example.com/note.txt", {
      kind: "document",
      mime: "text/plain",
      filename: "note.txt",
      isGroup: true,
    })).rejects.toThrow(/群聊.*暂不开放文件类型/);

    expect(fetch.mock.calls.some(([url]) => String(url).includes("/v2/groups/group-openid/files"))).toBe(false);
    adapter.stop();
  });
});

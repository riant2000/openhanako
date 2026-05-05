import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChannel, appendMessage } from "../lib/channels/channel-store.js";
import { createChannelTicker } from "../lib/channels/channel-ticker.js";

vi.mock("../lib/debug-log.js", () => ({
  debugLog: () => ({ log: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

function mktemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hana-channel-ticker-"));
}

describe("channel-ticker membership source", () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("triages an agent listed in channel members even when its cursor projection is missing", async () => {
    tmpDir = mktemp();
    const channelsDir = path.join(tmpDir, "channels");
    const agentsDir = path.join(tmpDir, "agents");
    const agentDir = path.join(agentsDir, "hana");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "channels.md"), "# 频道\n\n", "utf-8");

    const { id: channelId } = await createChannel(channelsDir, {
      id: "ch_crew",
      name: "Crew",
      members: ["hana"],
    });
    await appendMessage(path.join(channelsDir, `${channelId}.md`), "user", "@Hana hello");

    const executeCheck = vi.fn(async () => ({ replied: false }));
    const ticker = createChannelTicker({
      channelsDir,
      agentsDir,
      getAgentOrder: () => ["hana"],
      executeCheck,
      onMemorySummarize: vi.fn(),
    });

    ticker.start();
    try {
      await ticker.triggerImmediate(channelId);
    } finally {
      await ticker.stop();
    }

    expect(executeCheck).toHaveBeenCalledOnce();
    expect(executeCheck.mock.calls[0][0]).toBe("hana");
    expect(executeCheck.mock.calls[0][1]).toBe(channelId);
  });
});

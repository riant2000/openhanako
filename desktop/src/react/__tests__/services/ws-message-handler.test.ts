import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/use-stream-buffer', () => ({
  streamBufferManager: {
    handle: vi.fn(),
  },
}));

vi.mock('../../stores/session-actions', () => ({
  loadSessions: vi.fn(),
}));

vi.mock('../../stores/desk-actions', () => ({
  loadDeskFiles: vi.fn(),
}));

vi.mock('../../stores/channel-actions', () => ({
  loadChannels: vi.fn(),
  openChannel: vi.fn(),
}));

vi.mock('../../stores/artifact-actions', () => ({
  handleArtifact: vi.fn(),
}));

vi.mock('../../services/websocket', () => ({
  getWebSocket: () => null,
}));

vi.mock('../../services/stream-resume', () => ({
  replayStreamResume: vi.fn(),
  isStreamResumeRebuilding: () => null,
  isStreamScopedMessage: () => false,
  updateSessionStreamMeta: vi.fn(),
}));

import { useStore } from '../../stores';
import { handleServerMessage } from '../../services/ws-message-handler';

describe('ws-message-handler session-scoped desktop events', () => {
  beforeEach(() => {
    useStore.setState({
      currentSessionPath: '/session/a.jsonl',
      pendingNewSession: false,
      sessions: [{
        path: '/session/a.jsonl',
        title: 'A',
        firstMessage: 'hello',
        modified: '2026-04-24T10:00:00.000Z',
        messageCount: 1,
        agentId: 'a1',
        agentName: 'Hana',
        cwd: null,
      }],
      chatSessions: {},
      streamingSessions: [],
    } as never);
    useStore.getState().clearSession('/session/a.jsonl');
    useStore.getState().initSession('/session/a.jsonl', [], false);
  });

  it('session_user_message 直接把 user message 追加到对应桌面 session', () => {
    handleServerMessage({
      type: 'session_user_message',
      sessionPath: '/session/a.jsonl',
      message: {
        text: 'hello from bridge',
        quotedText: 'quote',
        attachments: [{ path: '/tmp/a.png', name: 'a.png', isDir: false }],
      },
    });

    const items = useStore.getState().chatSessions['/session/a.jsonl']?.items || [];
    expect(items).toHaveLength(1);
    const first = items[0];
    expect(first?.type).toBe('message');
    if (!first || first.type !== 'message') throw new Error('expected message item');
    expect(first.data.role).toBe('user');
    expect(first.data.text).toBe('hello from bridge');
    expect(first.data.quotedText).toBe('quote');
    expect(first.data.attachments).toEqual([{ path: '/tmp/a.png', name: 'a.png', isDir: false }]);
  });

  it('bridge_rc_attached / detached 直接补丁 sessions 列表上的接管态', () => {
    handleServerMessage({
      type: 'bridge_rc_attached',
      sessionPath: '/session/a.jsonl',
      sessionKey: 'feishu_dm_1@a1',
      platform: 'feishu',
      title: 'A',
    });

    expect(useStore.getState().sessions[0]?.rcAttachment).toEqual({
      sessionKey: 'feishu_dm_1@a1',
      platform: 'feishu',
      title: 'A',
    });

    handleServerMessage({
      type: 'bridge_rc_detached',
      sessionPath: '/session/a.jsonl',
    });

    expect(useStore.getState().sessions[0]?.rcAttachment).toBeNull();
  });
});

/**
 * rc-state.js — /rc & /exitrc 的内存态管理
 *
 * 持有两种跨消息的临时状态，按 bridge sessionKey 为键：
 *   1. pending-selection —— 等待用户输入（当前只用于数字选 session，未来可扩展到 yes/no 等）
 *   2. attachment —— 当前 bridge session 已接管某桌面 session
 *
 * 两态同 sessionKey 时刻只持有一个（选择进行中不可能同时已接管；接管中收到新 /rc 会先 reset 再列）。
 *
 * 持久化策略：内存 only，重启即清空。用户已明确"接管态不持久化"。
 *
 * 过期机制：懒惰过期（lazy expiration）——不开后台扫描，每次 getPending 时检查 expiresAt。
 *   过期条目在下次访问时清除。无访问亦无害，重启时连 Map 一起消失。
 */

const PENDING_DEFAULT_TTL_MS = 5 * 60 * 1000;  // 5 分钟

/**
 * @typedef {object} PendingSpec
 * @property {'rc-select'} type  当前仅 rc-select；预留扩展：'yes-no' / 'free-text'
 * @property {string} promptText  提示原文（用于重发或排障）
 * @property {Array<{path: string, title: string|null}>} options  1-based 序号对应的桌面 session 列表
 * @property {number} expiresAt  绝对时间戳（Date.now() + ttl）
 */

/**
 * @typedef {object} Attachment
 * @property {string} desktopSessionPath  被接管的桌面 session 绝对路径
 * @property {number} attachedAt  毫秒时间戳，用于排障
 */

export class RcStateStore {
  /**
   * @param {{ ttlMs?: number }} [opts]
   */
  constructor({ ttlMs = PENDING_DEFAULT_TTL_MS } = {}) {
    /** @type {Map<string, PendingSpec>} */
    this._pending = new Map();
    /** @type {Map<string, Attachment>} */
    this._attachment = new Map();
    this._ttlMs = ttlMs;
  }

  // ── pending-selection ──────────────────────────────────────

  /**
   * @param {string} sessionKey
   * @param {Omit<PendingSpec, 'expiresAt'>} spec
   */
  setPending(sessionKey, spec) {
    const expiresAt = Date.now() + this._ttlMs;
    this._pending.set(sessionKey, { ...spec, expiresAt });
  }

  /**
   * @param {string} sessionKey
   * @returns {PendingSpec | null}
   */
  getPending(sessionKey) {
    const p = this._pending.get(sessionKey);
    if (!p) return null;
    if (Date.now() >= p.expiresAt) {
      // 懒惰过期：一读到就清
      this._pending.delete(sessionKey);
      return null;
    }
    return p;
  }

  clearPending(sessionKey) {
    this._pending.delete(sessionKey);
  }

  /** @returns {boolean} */
  isPending(sessionKey) {
    return this.getPending(sessionKey) !== null;
  }

  // ── attachment ─────────────────────────────────────────────

  /**
   * @param {string} sessionKey
   * @param {string} desktopSessionPath  桌面 session 的 jsonl 绝对路径
   */
  attach(sessionKey, desktopSessionPath) {
    this._attachment.set(sessionKey, {
      desktopSessionPath,
      attachedAt: Date.now(),
    });
  }

  /**
   * @param {string} sessionKey
   * @returns {Attachment | null}
   */
  getAttachment(sessionKey) {
    return this._attachment.get(sessionKey) ?? null;
  }

  detach(sessionKey) {
    this._attachment.delete(sessionKey);
  }

  /** @returns {boolean} */
  isAttached(sessionKey) {
    return this._attachment.has(sessionKey);
  }

  // ── utility ────────────────────────────────────────────────

  /** 同时清 pending + attachment；/exitrc 和 session 重置场景用 */
  reset(sessionKey) {
    this._pending.delete(sessionKey);
    this._attachment.delete(sessionKey);
  }

  /**
   * 测试 / 排障用：返回所有接管态快照。生产代码不应依赖。
   * @returns {Array<Attachment & { sessionKey: string }>}
   */
  listAttachments() {
    return Array.from(this._attachment.entries()).map(([sessionKey, att]) => ({
      sessionKey,
      ...att,
    }));
  }
}

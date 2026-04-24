const DEEPSEEK_HIGH_THINKING_BUDGET = 32768;
const DEEPSEEK_HIGH_SAFE_MAX_TOKENS = 65536;
const DEEPSEEK_MAX_SAFE_MAX_TOKENS = 131072;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function positiveInteger(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function isKnownThinkingModelId(id) {
  const normalized = lower(id);
  return normalized === "deepseek-reasoner" || normalized.startsWith("deepseek-v4-");
}

export function isDeepSeekModel(model) {
  if (!model || typeof model !== "object") return false;
  const provider = lower(model.provider);
  const baseUrl = lower(model.baseUrl || model.base_url);
  return provider === "deepseek" || baseUrl.includes("api.deepseek.com");
}

function shouldUseThinking(payload, model) {
  if (payload.thinking?.type === "disabled") return false;
  return Boolean(
    payload.reasoning_effort
    || model?.reasoning === true
    || isKnownThinkingModelId(model?.id || payload.model)
  );
}

function normalizeReasoningEffort(payload) {
  if (!hasOwn(payload, "reasoning_effort")) return;
  if (payload.reasoning_effort === "low" || payload.reasoning_effort === "medium") {
    payload.reasoning_effort = "high";
  } else if (payload.reasoning_effort === "xhigh") {
    payload.reasoning_effort = "max";
  }
}

function stripReasoningContent(messages) {
  let changed = false;
  const next = messages.map((message) => {
    if (!message || typeof message !== "object" || !hasOwn(message, "reasoning_content")) {
      return message;
    }
    changed = true;
    const copy = { ...message };
    delete copy.reasoning_content;
    return copy;
  });
  return changed ? next : messages;
}

function disableThinking(payload) {
  delete payload.reasoning_effort;
  payload.thinking = { type: "disabled" };
  const stripped = stripReasoningContent(payload.messages);
  if (stripped !== payload.messages) payload.messages = stripped;
}

function normalizeMaxTokenField(payload) {
  if (!hasOwn(payload, "max_completion_tokens")) return;
  if (!hasOwn(payload, "max_tokens")) {
    payload.max_tokens = payload.max_completion_tokens;
  }
  delete payload.max_completion_tokens;
}

function ensureThinkingTokenBudget(payload, model) {
  const current = positiveInteger(payload.max_tokens);
  if (current && current > DEEPSEEK_HIGH_THINKING_BUDGET) return;

  const modelLimit = positiveInteger(model?.maxTokens || model?.maxOutput);
  const desired = payload.reasoning_effort === "max"
    ? DEEPSEEK_MAX_SAFE_MAX_TOKENS
    : DEEPSEEK_HIGH_SAFE_MAX_TOKENS;
  const target = modelLimit ? Math.min(modelLimit, desired) : desired;

  if (target <= DEEPSEEK_HIGH_THINKING_BUDGET) {
    disableThinking(payload);
    return;
  }

  payload.max_tokens = target;
}

export function normalizeDeepSeekChatPayload(payload, model) {
  if (!isDeepSeekModel(model) || !payload || typeof payload !== "object" || !Array.isArray(payload.messages)) {
    return payload;
  }

  let next = payload;
  const editable = () => {
    if (next === payload) next = { ...payload };
    return next;
  };

  if (hasOwn(payload, "max_completion_tokens")) {
    normalizeMaxTokenField(editable());
  }

  if (!shouldUseThinking(next, model)) return next;

  if (Array.isArray(next.tools) && next.tools.length > 0) {
    disableThinking(editable());
    return next;
  }

  const p = editable();
  normalizeReasoningEffort(p);
  ensureThinkingTokenBudget(p, model);
  return next;
}

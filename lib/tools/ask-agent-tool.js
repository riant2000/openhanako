/**
 * ask-agent-tool.js — 跨 Agent 调用
 *
 * 借用另一个 agent 的身份视角和模型能力做单次回复。
 * 被调用方带 personality（yuan + ishiki + 用户信息），但不带记忆和工具。
 * Session 不保留，不进记忆系统。
 *
 * discovery 模式：agent="?" 时列出所有可用 agent 的能力说明。
 */

import { Type } from "@sinclair/typebox";
import { t } from "../../server/i18n.js";
import { runAgentSession } from "../../hub/agent-executor.js";

/** 格式化 agent 列表条目（summary + model） */
function formatAgentEntry(a) {
  const label = a.name && a.name !== a.id ? `${a.id} (${a.name})` : a.id;
  const parts = [label];
  if (a.model) parts.push(`[${a.model}]`);
  if (a.summary) parts.push(a.summary);
  return parts.join(" — ");
}

/**
 * @param {object} opts
 * @param {string} opts.agentId - 当前 agent ID
 * @param {() => Array<{id: string, name: string, summary?: string, model?: string}>} opts.listAgents
 * @param {import('../../core/engine.js').HanaEngine} opts.engine
 */
export function createAskAgentTool({ agentId, listAgents, engine }) {
  return {
    name: "ask_agent",
    label: t("toolDef.askAgent.label"),
    description: t("toolDef.askAgent.description"),
    parameters: Type.Object({
      agent: Type.String({ description: t("toolDef.askAgent.agentDesc") }),
      task: Type.Optional(Type.String({ description: t("toolDef.askAgent.taskDesc") })),
    }),

    execute: async (_toolCallId, params, signal) => {
      // discovery 模式：列出所有可用 agent
      if (params.agent === "?" || params.agent === "list") {
        const agents = listAgents().filter(a => a.id !== agentId);
        if (!agents.length) {
          return { content: [{ type: "text", text: t("error.noOtherAgents") }] };
        }
        const lines = agents.map(a => "- " + formatAgentEntry(a));
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      if (params.agent === agentId) {
        return { content: [{ type: "text", text: t("error.cannotCallSelf") }] };
      }

      if (!params.task) {
        return { content: [{ type: "text", text: t("error.askAgentNoTask") }] };
      }

      const agents = listAgents();
      const target = agents.find(a => a.id === params.agent);
      if (!target) {
        const lines = agents
          .filter(a => a.id !== agentId)
          .map(a => formatAgentEntry(a));
        return {
          content: [{ type: "text", text: t("error.agentNotFoundAvailable", { id: params.agent, ids: lines.join("\n") || "(none)" }) }],
        };
      }

      try {
        const reply = await runAgentSession(
          params.agent,
          [{ text: params.task, capture: true }],
          {
            engine,
            signal,
            sessionSuffix: "ask-temp",
            keepSession: false,
            noMemory: true,
            readOnly: true,
          },
        );

        return {
          content: [{ type: "text", text: reply || t("error.agentNoReply", { name: target.name }) }],
          details: { from: agentId, to: params.agent, agentName: target.name },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: t("error.agentCallFailed", { name: target.name, msg: err.message }) }],
        };
      }
    },
  };
}

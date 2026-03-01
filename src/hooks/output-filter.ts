import type { OutputFilterConfig } from "../config/types.hooks.js";

export interface FilterContext {
  content: string;
  channelId?: string;
  sessionKey?: string;
}

export interface FilterResult {
  content: string;
  modified: boolean;
  appliedRules: number;
}

export function applyOutputFilter(
  context: FilterContext,
  config: OutputFilterConfig | undefined,
): FilterResult {
  if (!config || config.enabled === false) {
    return { content: context.content, modified: false, appliedRules: 0 };
  }

  const rules = config.regex ?? [];
  if (rules.length === 0) {
    return { content: context.content, modified: false, appliedRules: 0 };
  }

  let current = context.content;
  let appliedRules = 0;

  for (const rule of rules) {
    try {
      const flags = [rule.global !== false ? "g" : "", rule.caseInsensitive === true ? "i" : ""]
        .join("")
        .replace(/^$/, "");
      const re = new RegExp(rule.pattern, flags || undefined);
      const next = current.replace(re, rule.replacement);
      if (next !== current) {
        appliedRules++;
        current = next;
      }
    } catch (err) {
      console.warn(
        `[output-filter] Skipping invalid rule${rule.description ? ` "${rule.description}"` : ""}: ${String(err)}`,
      );
    }
  }

  return {
    content: current,
    modified: current !== context.content,
    appliedRules,
  };
}

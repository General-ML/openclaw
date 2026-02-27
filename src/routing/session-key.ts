import type { ChatType } from "../channels/chat-type.js";
import { parseAgentSessionKey, type ParsedAgentSessionKey } from "../sessions/session-key-utils.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "./account-id.js";

export {
  getSubagentDepth,
  isCronSessionKey,
  isAcpSessionKey,
  isSubagentSessionKey,
  parseAgentSessionKey,
  type ParsedAgentSessionKey,
} from "../sessions/session-key-utils.js";
export {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "./account-id.js";

export const DEFAULT_AGENT_ID = "main";
export const DEFAULT_MAIN_KEY = "main";
export type SessionKeyShape = "missing" | "agent" | "legacy_or_alias" | "malformed_agent";

// Pre-compiled regex
const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;

function normalizeToken(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeMainKey(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.toLowerCase() : DEFAULT_MAIN_KEY;
}

export function toAgentRequestSessionKey(storeKey: string | undefined | null): string | undefined {
  const raw = (storeKey ?? "").trim();
  if (!raw) {
    return undefined;
  }
  return parseAgentSessionKey(raw)?.rest ?? raw;
}

export function toAgentStoreSessionKey(params: {
  agentId: string;
  requestKey: string | undefined | null;
  mainKey?: string | undefined;
}): string {
  const raw = (params.requestKey ?? "").trim();
  if (!raw || raw === DEFAULT_MAIN_KEY) {
    return buildAgentMainSessionKey({ agentId: params.agentId, mainKey: params.mainKey });
  }
  const lowered = raw.toLowerCase();
  if (lowered.startsWith("agent:")) {
    return lowered;
  }
  if (lowered.startsWith("subagent:")) {
    return `agent:${normalizeAgentId(params.agentId)}:${lowered}`;
  }
  return `agent:${normalizeAgentId(params.agentId)}:${lowered}`;
}

export function resolveAgentIdFromSessionKey(sessionKey: string | undefined | null): string {
  const parsed = parseAgentSessionKey(sessionKey);
  return normalizeAgentId(parsed?.agentId ?? DEFAULT_AGENT_ID);
}

export function classifySessionKeyShape(sessionKey: string | undefined | null): SessionKeyShape {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return "missing";
  }
  if (parseAgentSessionKey(raw)) {
    return "agent";
  }
  return raw.toLowerCase().startsWith("agent:") ? "malformed_agent" : "legacy_or_alias";
}

export function normalizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_AGENT_ID;
  }
  // Keep it path-safe + shell-friendly.
  if (VALID_ID_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  // Best-effort fallback: collapse invalid characters to "-"
  return (
    trimmed
      .toLowerCase()
      .replace(INVALID_CHARS_RE, "-")
      .replace(LEADING_DASH_RE, "")
      .replace(TRAILING_DASH_RE, "")
      .slice(0, 64) || DEFAULT_AGENT_ID
  );
}

export function sanitizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_AGENT_ID;
  }
  if (VALID_ID_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return (
    trimmed
      .toLowerCase()
      .replace(INVALID_CHARS_RE, "-")
      .replace(LEADING_DASH_RE, "")
      .replace(TRAILING_DASH_RE, "")
      .slice(0, 64) || DEFAULT_AGENT_ID
  );
}

export function buildAgentMainSessionKey(params: {
  agentId: string;
  mainKey?: string | undefined;
}): string {
  const agentId = normalizeAgentId(params.agentId);
  const mainKey = normalizeMainKey(params.mainKey);
  return `agent:${agentId}:${mainKey}`;
}

export function buildAgentPeerSessionKey(params: {
  agentId: string;
  mainKey?: string | undefined;
  channel: string;
  accountId?: string | null;
  peerKind?: ChatType | null;
  peerId?: string | null;
  identityLinks?: Record<string, string[]>;
  /** DM session scope. */
  dmScope?: "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";
}): string {
  const peerKind = params.peerKind ?? "direct";
  if (peerKind === "direct") {
    const dmScope = params.dmScope ?? "main";
    let peerId = (params.peerId ?? "").trim();
    const linkedPeerId =
      dmScope === "main"
        ? null
        : resolveLinkedPeerId({
            identityLinks: params.identityLinks,
            channel: params.channel,
            peerId,
          });
    if (linkedPeerId) {
      peerId = linkedPeerId;
    }
    peerId = peerId.toLowerCase();
    if (dmScope === "per-account-channel-peer" && peerId) {
      const channel = (params.channel ?? "").trim().toLowerCase() || "unknown";
      const accountId = normalizeAccountId(params.accountId);
      return `agent:${normalizeAgentId(params.agentId)}:${channel}:${accountId}:direct:${peerId}`;
    }
    if (dmScope === "per-channel-peer" && peerId) {
      const channel = (params.channel ?? "").trim().toLowerCase() || "unknown";
      return `agent:${normalizeAgentId(params.agentId)}:${channel}:direct:${peerId}`;
    }
    if (dmScope === "per-peer" && peerId) {
      return `agent:${normalizeAgentId(params.agentId)}:direct:${peerId}`;
    }
    return buildAgentMainSessionKey({
      agentId: params.agentId,
      mainKey: params.mainKey,
    });
  }
  const channel = (params.channel ?? "").trim().toLowerCase() || "unknown";
  const peerId = ((params.peerId ?? "").trim() || "unknown").toLowerCase();
  return `agent:${normalizeAgentId(params.agentId)}:${channel}:${peerKind}:${peerId}`;
}

function resolveLinkedPeerId(params: {
  identityLinks?: Record<string, string[]>;
  channel: string;
  peerId: string;
}): string | null {
  const identityLinks = params.identityLinks;
  if (!identityLinks) {
    return null;
  }
  const peerId = params.peerId.trim();
  if (!peerId) {
    return null;
  }
  const candidates = new Set<string>();
  const rawCandidate = normalizeToken(peerId);
  if (rawCandidate) {
    candidates.add(rawCandidate);
  }
  const channel = normalizeToken(params.channel);
  if (channel) {
    const scopedCandidate = normalizeToken(`${channel}:${peerId}`);
    if (scopedCandidate) {
      candidates.add(scopedCandidate);
    }
  }
  if (candidates.size === 0) {
    return null;
  }
  for (const [canonical, ids] of Object.entries(identityLinks)) {
    const canonicalName = canonical.trim();
    if (!canonicalName) {
      continue;
    }
    if (!Array.isArray(ids)) {
      continue;
    }
    for (const id of ids) {
      const normalized = normalizeToken(id);
      if (normalized && candidates.has(normalized)) {
        return canonicalName;
      }
    }
  }
  return null;
}

export function buildGroupHistoryKey(params: {
  channel: string;
  accountId?: string | null;
  peerKind: "group" | "channel";
  peerId: string;
}): string {
  const channel = normalizeToken(params.channel) || "unknown";
  const accountId = normalizeAccountId(params.accountId);
  const peerId = params.peerId.trim().toLowerCase() || "unknown";
  return `${channel}:${accountId}:${params.peerKind}:${peerId}`;
}

export function resolveThreadSessionKeys(params: {
  baseSessionKey: string;
  threadId?: string | null;
  parentSessionKey?: string;
  useSuffix?: boolean;
}): { sessionKey: string; parentSessionKey?: string } {
  const threadId = (params.threadId ?? "").trim();
  if (!threadId) {
    return { sessionKey: params.baseSessionKey, parentSessionKey: undefined };
  }
  const normalizedThreadId = threadId.toLowerCase();
  const useSuffix = params.useSuffix ?? true;
  const sessionKey = useSuffix
    ? `${params.baseSessionKey}:thread:${normalizedThreadId}`
    : params.baseSessionKey;
  return { sessionKey, parentSessionKey: params.parentSessionKey };
}

// ─── GML-73: Named Conversations ─────────────────────────────────────────────

export const NAMED_CONV_NAMESPACE = "conv";

/**
 * Normalizes a user-supplied conversation name into a lowercase, URL-safe slug
 * suitable for use in a session key.
 *
 * Rules:
 *  - Trims whitespace
 *  - Lowercases
 *  - Replaces runs of non-alphanumeric (non-hyphen, non-underscore) chars with a single hyphen
 *  - Strips leading/trailing hyphens
 *  - Truncates to 64 characters
 *  - Returns "default" if the result is empty
 *
 * Examples:
 *   normalizeName("Trading Research")  → "trading-research"
 *   normalizeName("code_review")       → "code_review"
 *   normalizeName("  my-plan!  ")      → "my-plan"
 *   normalizeName("")                  → "default"
 */
export function normalizeName(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "default";
  }
  const VALID_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
  if (VALID_NAME_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  // Best-effort: collapse invalid chars → hyphen, strip leading/trailing hyphens, truncate
  const INVALID_NAME_CHARS_RE = /[^a-z0-9_-]+/g;
  const result =
    trimmed
      .toLowerCase()
      .replace(INVALID_NAME_CHARS_RE, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "")
      .slice(0, 64) || "default";
  return result;
}

/**
 * Builds the session key for a named conversation.
 *
 * Format: `agent:<agentId>:conv:<name>`
 *
 * The `conv:` namespace segment distinguishes named conversations from:
 *   - DMs:     `agent:main:main`
 *   - Groups:  `agent:main:telegram:group:1234`
 *   - Threads: `agent:main:main:thread:abcdef`
 *   - Cron:    `agent:main:cron:...`
 *   - Sub-agents: `agent:main:subagent:...`
 *
 * Examples:
 *   buildAgentNamedSessionKey({ agentId: "main", name: "trading-research" })
 *   → "agent:main:conv:trading-research"
 *
 *   buildAgentNamedSessionKey({ agentId: "main", name: "Code Review 2025" })
 *   → "agent:main:conv:code-review-2025"
 */
export function buildAgentNamedSessionKey(params: { agentId: string; name: string }): string {
  const agentId = normalizeAgentId(params.agentId);
  const name = normalizeName(params.name);
  return `agent:${agentId}:${NAMED_CONV_NAMESPACE}:${name}`;
}

/**
 * Returns true if the given session key is a named conversation key
 * (i.e., matches the `agent:<id>:conv:<name>` format).
 */
export function isNamedConversationSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = (sessionKey ?? "").trim().toLowerCase();
  const parts = raw.split(":");
  return parts.length === 4 && parts[0] === "agent" && parts[2] === NAMED_CONV_NAMESPACE;
}

/**
 * Extracts the conversation name from a named conversation session key.
 * Returns null if the key is not a named conversation key.
 *
 * Example:
 *   extractConversationName("agent:main:conv:trading-research") → "trading-research"
 *   extractConversationName("agent:main:main") → null
 */
export function extractConversationName(sessionKey: string | undefined | null): string | null {
  if (!isNamedConversationSessionKey(sessionKey)) {
    return null;
  }
  const parts = (sessionKey ?? "").trim().toLowerCase().split(":");
  return parts[3] ?? null;
}

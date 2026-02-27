import { promises as fs } from "node:fs";
import path from "node:path";
import { buildAgentNamedSessionKey, normalizeName } from "../routing/session-key.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/** A map of conversation name → session key */
export type ConversationMap = Record<string, string>;

// ─── Storage path ───────────────────────────────────────────────────────────

const CONVERSATIONS_FILE = "conversations.json";

function getConversationsPath(agentDir: string): string {
  return path.join(agentDir, CONVERSATIONS_FILE);
}

// ─── Read ────────────────────────────────────────────────────────────────────

/**
 * Loads the named conversations map for the given agent.
 * Returns an empty map if the file doesn't exist or is malformed.
 */
export async function loadNamedConversations(agentDir: string): Promise<ConversationMap> {
  const filePath = getConversationsPath(agentDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      // Validate: all values must be strings
      const valid: ConversationMap = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") {
          valid[k] = v;
        }
      }
      return valid;
    }
  } catch {
    // File not found or parse error — return empty map
  }
  return {};
}

/**
 * Resolves the session key for a named conversation.
 * Returns null if no conversation with that name exists.
 *
 * The name is normalized before lookup (case-insensitive, slug-safe).
 */
export async function resolveNamedConversationKey(
  agentDir: string,
  name: string,
): Promise<string | null> {
  const normalized = normalizeName(name);
  const map = await loadNamedConversations(agentDir);
  return map[normalized] ?? null;
}

// ─── Write ───────────────────────────────────────────────────────────────────

/**
 * Saves a named conversation to the store.
 * If a conversation with the same (normalized) name exists, it is overwritten.
 *
 * @param agentDir  - The agent's state directory (e.g., ~/.openclaw/agents/main/agent)
 * @param agentId   - The agent ID (used to build the session key)
 * @param name      - The user-supplied name (will be normalized)
 * @returns         - The session key that was stored
 */
export async function saveNamedConversation(
  agentDir: string,
  agentId: string,
  name: string,
): Promise<string> {
  const normalizedName = normalizeName(name);
  const sessionKey = buildAgentNamedSessionKey({ agentId, name: normalizedName });

  const filePath = getConversationsPath(agentDir);
  const existing = await loadNamedConversations(agentDir);
  const updated: ConversationMap = { ...existing, [normalizedName]: sessionKey };

  // Ensure the directory exists
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2) + "\n", "utf-8");

  return sessionKey;
}

/**
 * Removes a named conversation from the store.
 * No-op if the name doesn't exist.
 *
 * @returns true if the conversation was found and removed, false otherwise
 */
export async function deleteNamedConversation(agentDir: string, name: string): Promise<boolean> {
  const normalizedName = normalizeName(name);
  const filePath = getConversationsPath(agentDir);
  const existing = await loadNamedConversations(agentDir);

  if (!(normalizedName in existing)) {
    return false;
  }

  const { [normalizedName]: _removed, ...remaining } = existing;
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(remaining, null, 2) + "\n", "utf-8");
  return true;
}

/**
 * Renames a named conversation. Atomically removes the old entry and
 * adds the new one, preserving the session key.
 *
 * @returns The session key, or null if the old name didn't exist.
 */
export async function renameNamedConversation(
  agentDir: string,
  oldName: string,
  newName: string,
): Promise<string | null> {
  const normalizedOld = normalizeName(oldName);
  const normalizedNew = normalizeName(newName);
  const filePath = getConversationsPath(agentDir);
  const existing = await loadNamedConversations(agentDir);

  if (!(normalizedOld in existing)) {
    return null;
  }

  const sessionKey = existing[normalizedOld];
  const { [normalizedOld]: _removed, ...remaining } = existing;
  const updated: ConversationMap = { ...remaining, [normalizedNew]: sessionKey };

  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  return sessionKey;
}

// ─── Utils ───────────────────────────────────────────────────────────────────

/**
 * Returns a sorted list of conversation names for the given agent.
 * Suitable for display in `/sessions list`.
 */
export async function listNamedConversations(
  agentDir: string,
): Promise<Array<{ name: string; sessionKey: string }>> {
  const map = await loadNamedConversations(agentDir);
  return Object.entries(map)
    .map(([name, sessionKey]) => ({ name, sessionKey }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

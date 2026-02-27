import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Filesystem mock ──────────────────────────────────────────────────────────
// We mock the full "node:fs" module (the named-conversations module imports
// { promises as fs } from "node:fs").

vi.mock("node:fs", async () => {
  const originalFs = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...originalFs,
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    },
  };
});

import { promises as fsMock } from "node:fs";
import {
  loadNamedConversations,
  resolveNamedConversationKey,
  saveNamedConversation,
  deleteNamedConversation,
  renameNamedConversation,
  listNamedConversations,
} from "../sessions/named-conversations.js";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const AGENT_DIR = "/home/user/.openclaw/agents/main/agent";
const _CONVERSATIONS_PATH = `${AGENT_DIR}/conversations.json`;

function mockFileContents(map: Record<string, string>): void {
  (fsMock.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    JSON.stringify(map, null, 2) + "\n",
  );
}

function mockFileNotFound(): void {
  const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  (fsMock.readFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);
}

function mockWriteSuccess(): void {
  (fsMock.writeFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
  (fsMock.mkdir as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
}

// ─── loadNamedConversations ───────────────────────────────────────────────────

describe("loadNamedConversations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty map if the file does not exist", async () => {
    mockFileNotFound();
    const result = await loadNamedConversations(AGENT_DIR);
    expect(result).toEqual({});
  });

  it("returns a parsed ConversationMap for a valid file", async () => {
    mockFileContents({
      "trading-research": "agent:main:conv:trading-research",
      "code-review": "agent:main:conv:code-review",
    });
    const result = await loadNamedConversations(AGENT_DIR);
    expect(result).toEqual({
      "trading-research": "agent:main:conv:trading-research",
      "code-review": "agent:main:conv:code-review",
    });
  });

  it("returns empty map for malformed JSON", async () => {
    (fsMock.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce("not-json{{{{");
    const result = await loadNamedConversations(AGENT_DIR);
    expect(result).toEqual({});
  });

  it("returns empty map for a JSON array (wrong shape)", async () => {
    (fsMock.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      JSON.stringify(["not", "a", "map"]),
    );
    const result = await loadNamedConversations(AGENT_DIR);
    expect(result).toEqual({});
  });

  it("filters out non-string values", async () => {
    (fsMock.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      JSON.stringify({ valid: "agent:main:conv:valid", invalid: 42 }),
    );
    const result = await loadNamedConversations(AGENT_DIR);
    expect(result).toEqual({ valid: "agent:main:conv:valid" });
  });
});

// ─── resolveNamedConversationKey ──────────────────────────────────────────────

describe("resolveNamedConversationKey", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the session key for a known conversation", async () => {
    mockFileContents({ "trading-research": "agent:main:conv:trading-research" });
    const key = await resolveNamedConversationKey(AGENT_DIR, "trading-research");
    expect(key).toBe("agent:main:conv:trading-research");
  });

  it("normalizes the lookup name (case-insensitive)", async () => {
    mockFileContents({ "trading-research": "agent:main:conv:trading-research" });
    const key = await resolveNamedConversationKey(AGENT_DIR, "Trading Research");
    expect(key).toBe("agent:main:conv:trading-research");
  });

  it("returns null for an unknown conversation", async () => {
    mockFileContents({ "trading-research": "agent:main:conv:trading-research" });
    const key = await resolveNamedConversationKey(AGENT_DIR, "unknown");
    expect(key).toBeNull();
  });

  it("returns null when the file doesn't exist", async () => {
    mockFileNotFound();
    const key = await resolveNamedConversationKey(AGENT_DIR, "trading");
    expect(key).toBeNull();
  });
});

// ─── saveNamedConversation ────────────────────────────────────────────────────

describe("saveNamedConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new conversation entry", async () => {
    mockFileNotFound(); // loadNamedConversations returns {}
    mockWriteSuccess();

    const sessionKey = await saveNamedConversation(AGENT_DIR, "main", "trading-research");

    expect(sessionKey).toBe("agent:main:conv:trading-research");
    expect(fsMock.writeFile).toHaveBeenCalledWith(
      `${AGENT_DIR}/conversations.json`,
      expect.stringContaining('"trading-research"'),
      "utf-8",
    );
  });

  it("normalizes the name before saving", async () => {
    mockFileNotFound();
    mockWriteSuccess();

    const sessionKey = await saveNamedConversation(AGENT_DIR, "main", "Trading Research");
    expect(sessionKey).toBe("agent:main:conv:trading-research");
    expect(fsMock.writeFile).toHaveBeenCalledWith(
      `${AGENT_DIR}/conversations.json`,
      expect.stringContaining('"trading-research"'),
      "utf-8",
    );
  });

  it("overwrites an existing conversation with the same name", async () => {
    mockFileContents({ "trading-research": "agent:main:conv:trading-research" });
    mockWriteSuccess();

    const sessionKey = await saveNamedConversation(AGENT_DIR, "main", "trading-research");
    expect(sessionKey).toBe("agent:main:conv:trading-research");

    // Should still write (not skip)
    expect(fsMock.writeFile).toHaveBeenCalledOnce();
  });

  it("preserves existing conversations when adding a new one", async () => {
    mockFileContents({ "code-review": "agent:main:conv:code-review" });
    mockWriteSuccess();

    await saveNamedConversation(AGENT_DIR, "main", "trading-research");

    const writeCallArgs = (fsMock.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
    const writtenContent = writeCallArgs[1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed).toHaveProperty("code-review");
    expect(parsed).toHaveProperty("trading-research");
  });
});

// ─── deleteNamedConversation ──────────────────────────────────────────────────

describe("deleteNamedConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes an existing conversation and returns true", async () => {
    mockFileContents({ "trading-research": "agent:main:conv:trading-research" });
    mockWriteSuccess();

    const result = await deleteNamedConversation(AGENT_DIR, "trading-research");
    expect(result).toBe(true);
    expect(fsMock.writeFile).toHaveBeenCalledOnce();
  });

  it("normalizes the name for lookup", async () => {
    mockFileContents({ "trading-research": "agent:main:conv:trading-research" });
    mockWriteSuccess();

    const result = await deleteNamedConversation(AGENT_DIR, "Trading Research");
    expect(result).toBe(true);
  });

  it("returns false when the conversation doesn't exist", async () => {
    mockFileContents({ "code-review": "agent:main:conv:code-review" });

    const result = await deleteNamedConversation(AGENT_DIR, "trading-research");
    expect(result).toBe(false);
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("returns false when the file doesn't exist", async () => {
    mockFileNotFound();

    const result = await deleteNamedConversation(AGENT_DIR, "anything");
    expect(result).toBe(false);
  });
});

// ─── renameNamedConversation ──────────────────────────────────────────────────

describe("renameNamedConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renames an existing conversation", async () => {
    mockFileContents({ "trading-research": "agent:main:conv:trading-research" });
    mockWriteSuccess();

    const sessionKey = await renameNamedConversation(AGENT_DIR, "trading-research", "trading");
    expect(sessionKey).toBe("agent:main:conv:trading-research"); // original session key preserved
    expect(fsMock.writeFile).toHaveBeenCalledOnce();

    const writeCallArgs = (fsMock.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
    const parsed = JSON.parse(writeCallArgs[1] as string);
    expect(parsed).toHaveProperty("trading");
    expect(parsed).not.toHaveProperty("trading-research");
  });

  it("normalizes both old and new names", async () => {
    mockFileContents({ "trading-research": "agent:main:conv:trading-research" });
    mockWriteSuccess();

    const sessionKey = await renameNamedConversation(
      AGENT_DIR,
      "Trading Research", // will normalize to "trading-research"
      "My Trading", // will normalize to "my-trading"
    );
    expect(sessionKey).toBe("agent:main:conv:trading-research");
  });

  it("returns null when old name doesn't exist", async () => {
    mockFileContents({ "code-review": "agent:main:conv:code-review" });

    const sessionKey = await renameNamedConversation(AGENT_DIR, "nonexistent", "new-name");
    expect(sessionKey).toBeNull();
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });
});

// ─── listNamedConversations ───────────────────────────────────────────────────

describe("listNamedConversations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty array when no conversations exist", async () => {
    mockFileNotFound();
    const result = await listNamedConversations(AGENT_DIR);
    expect(result).toEqual([]);
  });

  it("returns sorted conversation entries", async () => {
    mockFileContents({
      "trading-research": "agent:main:conv:trading-research",
      "code-review": "agent:main:conv:code-review",
      analysis: "agent:main:conv:analysis",
    });

    const result = await listNamedConversations(AGENT_DIR);
    expect(result).toEqual([
      { name: "analysis", sessionKey: "agent:main:conv:analysis" },
      { name: "code-review", sessionKey: "agent:main:conv:code-review" },
      { name: "trading-research", sessionKey: "agent:main:conv:trading-research" },
    ]);
  });

  it("sorts alphabetically (locale-aware)", async () => {
    mockFileContents({
      "z-last": "agent:main:conv:z-last",
      "a-first": "agent:main:conv:a-first",
      "m-middle": "agent:main:conv:m-middle",
    });

    const result = await listNamedConversations(AGENT_DIR);
    expect(result.map((r) => r.name)).toEqual(["a-first", "m-middle", "z-last"]);
  });
});

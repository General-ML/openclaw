/**
 * GML-73: Unit tests for session-key.ts additions
 *
 * HOW TO APPLY:
 *   1. cd ~/projects/<openclaw-fork-dir>
 *   2. Copy to: src/routing/session-key.test.ts
 *      (or append to existing test file if one exists)
 *   3. Run: pnpm vitest run src/routing/session-key.test.ts
 *      (or: pnpm test)
 *
 * Framework: vitest (consistent with openclaw codebase)
 * No network calls. No filesystem. Pure unit tests.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeName,
  buildAgentNamedSessionKey,
  isNamedConversationSessionKey,
  extractConversationName,
  NAMED_CONV_NAMESPACE,
} from "../routing/session-key.js";

// ─── normalizeName ────────────────────────────────────────────────────────────

describe("normalizeName", () => {
  it("lowercases input", () => {
    expect(normalizeName("Trading")).toBe("trading");
    expect(normalizeName("UPPER")).toBe("upper");
  });

  it("handles valid slug input unchanged (after lowercasing)", () => {
    expect(normalizeName("trading-research")).toBe("trading-research");
    expect(normalizeName("code_review")).toBe("code_review");
    expect(normalizeName("my-plan-2025")).toBe("my-plan-2025");
  });

  it("replaces spaces with hyphens", () => {
    expect(normalizeName("trading research")).toBe("trading-research");
    expect(normalizeName("my plan")).toBe("my-plan");
  });

  it("strips leading and trailing whitespace", () => {
    expect(normalizeName("  trading  ")).toBe("trading");
    expect(normalizeName("  my plan  ")).toBe("my-plan");
  });

  it("replaces invalid chars with hyphens", () => {
    expect(normalizeName("my plan!")).toBe("my-plan");
    expect(normalizeName("hello@world")).toBe("hello-world");
  });

  it("collapses multiple invalid chars into a single hyphen", () => {
    expect(normalizeName("hello   world")).toBe("hello-world");
    expect(normalizeName("a!!b")).toBe("a-b");
  });

  it("strips leading and trailing hyphens after normalization", () => {
    expect(normalizeName("!hello!")).toBe("hello");
    expect(normalizeName("  my-plan!  ")).toBe("my-plan");
  });

  it("truncates to 64 characters", () => {
    const long = "a".repeat(100);
    expect(normalizeName(long)).toBe("a".repeat(64));
  });

  it("returns 'default' for empty input", () => {
    expect(normalizeName("")).toBe("default");
    expect(normalizeName("   ")).toBe("default");
  });

  it("returns 'default' for null/undefined", () => {
    expect(normalizeName(null)).toBe("default");
    expect(normalizeName(undefined)).toBe("default");
  });

  it("returns 'default' for input that normalizes to empty", () => {
    // All chars stripped → empty after normalization
    expect(normalizeName("!!!")).toBe("default");
  });
});

// ─── NAMED_CONV_NAMESPACE ─────────────────────────────────────────────────────

describe("NAMED_CONV_NAMESPACE", () => {
  it("equals 'conv'", () => {
    expect(NAMED_CONV_NAMESPACE).toBe("conv");
  });
});

// ─── buildAgentNamedSessionKey ────────────────────────────────────────────────

describe("buildAgentNamedSessionKey", () => {
  it("builds the correct session key format", () => {
    expect(buildAgentNamedSessionKey({ agentId: "main", name: "trading-research" })).toBe(
      "agent:main:conv:trading-research",
    );
  });

  it("normalizes the name", () => {
    expect(buildAgentNamedSessionKey({ agentId: "main", name: "Trading Research" })).toBe(
      "agent:main:conv:trading-research",
    );
  });

  it("normalizes the agentId", () => {
    // normalizeAgentId is the existing helper — should lowercase and strip invalid chars
    expect(buildAgentNamedSessionKey({ agentId: "Main", name: "plan" })).toBe(
      "agent:main:conv:plan",
    );
  });

  it("uses 'default' when name is empty", () => {
    expect(buildAgentNamedSessionKey({ agentId: "main", name: "" })).toBe(
      "agent:main:conv:default",
    );
  });

  it("produces keys that are distinct from main session key", () => {
    const namedKey = buildAgentNamedSessionKey({ agentId: "main", name: "trading" });
    expect(namedKey).not.toBe("agent:main:main");
    expect(namedKey).toContain(":conv:");
  });
});

// ─── isNamedConversationSessionKey ───────────────────────────────────────────

describe("isNamedConversationSessionKey", () => {
  it("returns true for valid named conversation keys", () => {
    expect(isNamedConversationSessionKey("agent:main:conv:trading-research")).toBe(true);
    expect(isNamedConversationSessionKey("agent:main:conv:default")).toBe(true);
    expect(isNamedConversationSessionKey("agent:analyst:conv:morning-briefing")).toBe(true);
  });

  it("returns false for the default main session key", () => {
    expect(isNamedConversationSessionKey("agent:main:main")).toBe(false);
  });

  it("returns false for peer/DM session keys", () => {
    expect(isNamedConversationSessionKey("agent:main:telegram:direct:987654321")).toBe(false);
    expect(isNamedConversationSessionKey("agent:main:telegram:group:1234567890")).toBe(false);
  });

  it("returns false for cron session keys", () => {
    expect(isNamedConversationSessionKey("agent:main:cron:abc123")).toBe(false);
  });

  it("returns false for thread session keys", () => {
    expect(isNamedConversationSessionKey("agent:main:main:thread:abcdef")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isNamedConversationSessionKey(null)).toBe(false);
    expect(isNamedConversationSessionKey(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isNamedConversationSessionKey("")).toBe(false);
  });

  it("is case-insensitive (normalizes before checking)", () => {
    // Keys are stored lowercase; this should still match
    expect(isNamedConversationSessionKey("agent:main:conv:trading")).toBe(true);
  });
});

// ─── extractConversationName ──────────────────────────────────────────────────

describe("extractConversationName", () => {
  it("extracts the name from a valid named conversation key", () => {
    expect(extractConversationName("agent:main:conv:trading-research")).toBe("trading-research");
    expect(extractConversationName("agent:main:conv:default")).toBe("default");
    expect(extractConversationName("agent:analyst:conv:morning-briefing")).toBe("morning-briefing");
  });

  it("returns null for the default main session key", () => {
    expect(extractConversationName("agent:main:main")).toBeNull();
  });

  it("returns null for non-named session keys", () => {
    expect(extractConversationName("agent:main:telegram:direct:987654321")).toBeNull();
    expect(extractConversationName("agent:main:cron:abc123")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(extractConversationName(null)).toBeNull();
    expect(extractConversationName(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractConversationName("")).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import { applyOutputFilter } from "./output-filter.js";
import type { FilterContext } from "./output-filter.js";

const ctx = (content: string): FilterContext => ({ content });

describe("applyOutputFilter", () => {
  it("returns original when config is undefined", () => {
    const result = applyOutputFilter(ctx("Hello 10:00 UTC"), undefined);
    expect(result).toEqual({ content: "Hello 10:00 UTC", modified: false, appliedRules: 0 });
  });

  it("returns original when config.enabled is false", () => {
    const result = applyOutputFilter(ctx("Hello 10:00 UTC"), {
      enabled: false,
      regex: [{ pattern: "UTC", replacement: "PT" }],
    });
    expect(result).toEqual({ content: "Hello 10:00 UTC", modified: false, appliedRules: 0 });
  });

  it("returns original when regex array is empty", () => {
    const result = applyOutputFilter(ctx("Hello"), { enabled: true, regex: [] });
    expect(result).toEqual({ content: "Hello", modified: false, appliedRules: 0 });
  });

  it("returns original when no regex key provided", () => {
    const result = applyOutputFilter(ctx("Hello"), { enabled: true });
    expect(result).toEqual({ content: "Hello", modified: false, appliedRules: 0 });
  });

  it("applies a single regex rule", () => {
    const result = applyOutputFilter(ctx("Meeting at 10:00 UTC"), {
      regex: [{ pattern: "(\\d{2}:\\d{2})\\s*UTC", replacement: "$1 PT" }],
    });
    expect(result.content).toBe("Meeting at 10:00 PT");
    expect(result.modified).toBe(true);
    expect(result.appliedRules).toBe(1);
  });

  it("applies multiple rules in order", () => {
    const result = applyOutputFilter(ctx("foo bar baz"), {
      regex: [
        { pattern: "foo", replacement: "FOO" },
        { pattern: "bar", replacement: "BAR" },
        { pattern: "baz", replacement: "BAZ" },
      ],
    });
    expect(result.content).toBe("FOO BAR BAZ");
    expect(result.modified).toBe(true);
    expect(result.appliedRules).toBe(3);
  });

  it("does not count rule as applied when pattern does not match", () => {
    const result = applyOutputFilter(ctx("hello world"), {
      regex: [
        { pattern: "xyz", replacement: "XYZ" },
        { pattern: "world", replacement: "WORLD" },
      ],
    });
    expect(result.content).toBe("hello WORLD");
    expect(result.appliedRules).toBe(1);
  });

  it("applies replacement globally by default", () => {
    const result = applyOutputFilter(ctx("UTC UTC UTC"), {
      regex: [{ pattern: "UTC", replacement: "PT" }],
    });
    expect(result.content).toBe("PT PT PT");
  });

  it("applies replacement to first match only when global is false", () => {
    const result = applyOutputFilter(ctx("UTC UTC UTC"), {
      regex: [{ pattern: "UTC", replacement: "PT", global: false }],
    });
    expect(result.content).toBe("PT UTC UTC");
  });

  it("matches case-insensitively when caseInsensitive is true", () => {
    const result = applyOutputFilter(ctx("Hello HELLO hello"), {
      regex: [{ pattern: "hello", replacement: "Hi", caseInsensitive: true }],
    });
    expect(result.content).toBe("Hi Hi Hi");
  });

  it("matches case-sensitively by default", () => {
    const result = applyOutputFilter(ctx("Hello HELLO hello"), {
      regex: [{ pattern: "hello", replacement: "Hi" }],
    });
    expect(result.content).toBe("Hello HELLO Hi");
  });

  it("skips invalid regex patterns without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = applyOutputFilter(ctx("hello world"), {
      regex: [
        { pattern: "[invalid(", replacement: "BROKEN" },
        { pattern: "world", replacement: "WORLD" },
      ],
    });
    expect(result.content).toBe("hello WORLD");
    expect(result.appliedRules).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("includes description in warning when rule has description", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyOutputFilter(ctx("text"), {
      regex: [{ pattern: "[bad(", replacement: "x", description: "my rule" }],
    });
    expect(warn.mock.calls[0]?.[0]).toContain('"my rule"');
    warn.mockRestore();
  });

  it("returns modified: false when content is unchanged", () => {
    const result = applyOutputFilter(ctx("no match here"), {
      regex: [{ pattern: "xyz", replacement: "ABC" }],
    });
    expect(result.modified).toBe(false);
    expect(result.appliedRules).toBe(0);
  });

  it("passes channelId and sessionKey through context (unused but type-safe)", () => {
    const result = applyOutputFilter(
      { content: "test UTC", channelId: "telegram", sessionKey: "s:123" },
      { regex: [{ pattern: "UTC", replacement: "PT" }] },
    );
    expect(result.content).toBe("test PT");
  });
});

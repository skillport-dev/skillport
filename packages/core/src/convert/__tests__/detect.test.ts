import { describe, it, expect } from "vitest";
import { detectPlatform, detectDynamicContexts, detectArgumentPlaceholders } from "../detect.js";

describe("detectPlatform", () => {
  it("detects OpenClaw from metadata.openclaw", () => {
    const md = `---
name: My Skill
description: desc
metadata:
  openclaw:
    requires: ">=1.0.0"
---

## Instructions
Do something.
`;
    expect(detectPlatform(md)).toBe("openclaw");
  });

  it("detects Claude Code from allowed-tools", () => {
    const md = `---
name: my-skill
description: desc
allowed-tools: Read, Grep
user-invocable: true
---

## Instructions
Do something.
`;
    expect(detectPlatform(md)).toBe("claude-code");
  });

  it("detects Claude Code from argument-hint", () => {
    const md = `---
name: my-skill
argument-hint: "[file-path]"
---

Body here.
`;
    expect(detectPlatform(md)).toBe("claude-code");
  });

  it("detects Claude Code from context: fork", () => {
    const md = `---
name: reviewer
context: fork
agent: Explore
---

Body.
`;
    expect(detectPlatform(md)).toBe("claude-code");
  });

  it("returns unknown when no frontmatter", () => {
    expect(detectPlatform("# Just a title\n\nSome text.")).toBe("unknown");
  });

  it("returns unknown for minimal frontmatter", () => {
    const md = `---
name: generic-skill
description: something
---

Body.
`;
    expect(detectPlatform(md)).toBe("unknown");
  });

  it("returns unknown for malformed frontmatter", () => {
    expect(detectPlatform("---\nbroken")).toBe("unknown");
  });
});

describe("detectDynamicContexts", () => {
  it("detects !`command` syntax", () => {
    const md = "Current diff: !`git diff`\nPR info: !`gh pr view $ARGUMENTS`";
    expect(detectDynamicContexts(md)).toEqual(["git diff", "gh pr view $ARGUMENTS"]);
  });

  it("returns empty for no dynamic context", () => {
    expect(detectDynamicContexts("Just some `code` here")).toEqual([]);
  });

  it("handles backticks that are not dynamic context", () => {
    expect(detectDynamicContexts("Use `git diff` to check changes")).toEqual([]);
  });
});

describe("detectArgumentPlaceholders", () => {
  it("detects $ARGUMENTS", () => {
    expect(detectArgumentPlaceholders("Do something with $ARGUMENTS")).toEqual(["$ARGUMENTS"]);
  });

  it("detects $0 and $1", () => {
    expect(detectArgumentPlaceholders("File: $0, line: $1")).toEqual(["$0", "$1"]);
  });

  it("detects $ARGUMENTS[0]", () => {
    expect(detectArgumentPlaceholders("Use $ARGUMENTS[0] as the path")).toEqual(["$ARGUMENTS[0]"]);
  });

  it("returns empty when none present", () => {
    expect(detectArgumentPlaceholders("No placeholders here")).toEqual([]);
  });

  it("deduplicates", () => {
    expect(detectArgumentPlaceholders("$ARGUMENTS and $ARGUMENTS again")).toEqual(["$ARGUMENTS"]);
  });
});

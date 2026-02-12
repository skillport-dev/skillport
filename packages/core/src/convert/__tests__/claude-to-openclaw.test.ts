import { describe, it, expect } from "vitest";
import { convertToOpenClaw } from "../claude-to-openclaw.js";

describe("convertToOpenClaw", () => {
  const basicCC = `---
name: review-pr
description: Reviews a pull request for issues
argument-hint: "[PR number]"
user-invocable: true
allowed-tools: Read, Grep, Glob
context: fork
---

## Context
- PR diff: !\`gh pr diff $ARGUMENTS\`
- PR info: !\`gh pr view $ARGUMENTS\`

## Instructions

Review the pull request and provide feedback on:
- Code quality
- Security issues
- Test coverage
`;

  it("converts basic Claude Code to OpenClaw", () => {
    const result = convertToOpenClaw(basicCC, new Map());
    expect(result.platform).toBe("openclaw");
    expect(result.skillMd).toContain("name: review-pr");
    expect(result.skillMd).toContain("openclaw: {}");
  });

  it("preserves allowed-tools as metadata comment", () => {
    const result = convertToOpenClaw(basicCC, new Map());
    expect(result.skillMd).toContain("skillport:platform_meta");
    expect(result.skillMd).toContain("allowed_tools");
    expect(result.warnings.some((w) => w.type === "tools")).toBe(true);
  });

  it("preserves context and agent in metadata", () => {
    const result = convertToOpenClaw(basicCC, new Map());
    expect(result.skillMd).toContain('context: "fork"');
  });

  it("handles dynamic context — warns and creates manual section", () => {
    const result = convertToOpenClaw(basicCC, new Map());
    expect(result.skillMd).toContain("skillport:dynamic_context");
    expect(result.skillMd).toContain("Context (Manual Input Required)");
    expect(result.skillMd).toContain("gh pr diff");
    expect(result.warnings.some((w) => w.type === "dynamic_context")).toBe(true);
  });

  it("converts $ARGUMENTS to {ARGUMENTS}", () => {
    const result = convertToOpenClaw(basicCC, new Map());
    expect(result.skillMd).toContain("{ARGUMENTS}");
    expect(result.warnings.some((w) => w.type === "arguments")).toBe(true);
  });

  it("converts $0 and $1 to {ARG_0} and {ARG_1}", () => {
    const md = `---
name: multi-arg
allowed-tools: Read
---

Read file $0 and search for $1.
`;
    const result = convertToOpenClaw(md, new Map());
    expect(result.skillMd).toContain("{ARG_0}");
    expect(result.skillMd).toContain("{ARG_1}");
  });

  it("creates Arguments section from argument-hint", () => {
    const result = convertToOpenClaw(basicCC, new Map());
    expect(result.skillMd).toContain("## Arguments");
    expect(result.skillMd).toContain("[PR number]");
  });

  it("preserves argument-hint in metadata", () => {
    const result = convertToOpenClaw(basicCC, new Map());
    expect(result.skillMd).toContain("argument_hint");
  });

  it("skips metadata when preserveMeta is false", () => {
    const result = convertToOpenClaw(basicCC, new Map(), { preserveMeta: false });
    expect(result.skillMd).not.toContain("skillport:platform_meta");
  });

  it("handles skill with no dynamic context", () => {
    const md = `---
name: simple-cc
description: A simple skill
user-invocable: true
---

## Instructions

Just do something simple.
`;
    const result = convertToOpenClaw(md, new Map());
    expect(result.skillMd).not.toContain("dynamic_context");
    expect(result.skillMd).not.toContain("Manual Input Required");
  });

  it("does not execute dynamic context commands", () => {
    const md = `---
name: dangerous
---

Result: !\`rm -rf /\`
`;
    // The converter should NOT execute the command
    const result = convertToOpenClaw(md, new Map());
    expect(result.skillMd).toContain("skillport:dynamic_context");
    expect(result.skillMd).not.toContain("rm -rf /\n"); // Should not be in body
    expect(result.warnings.some((w) => w.type === "dynamic_context")).toBe(true);
  });

  it("passes through files unchanged", () => {
    const files = new Map<string, Buffer>([
      ["template.txt", Buffer.from("hello")],
    ]);
    const result = convertToOpenClaw(basicCC, files);
    expect(result.files.has("template.txt")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { convertToClaudeCode } from "../openclaw-to-claude.js";

describe("convertToClaudeCode", () => {
  const basicOC = `---
name: Git Commit Helper
description: Generates conventional commit messages
metadata:
  openclaw:
    requires: ">=1.0.0"
---

## Instructions

Analyze the staged changes and generate a conventional commit message.

## Steps

1. Run \`git diff --staged\` to see changes
2. Categorize the change (feat, fix, refactor, etc.)
3. Write a concise commit message following conventional commits
`;

  it("converts basic OpenClaw to Claude Code", () => {
    const result = convertToClaudeCode(basicOC, new Map());
    expect(result.platform).toBe("claude-code");
    expect(result.skillMd).toContain("name: git-commit-helper");
    expect(result.skillMd).toContain("user-invocable: true");
    expect(result.skillMd).toContain("## Instructions");
    expect(result.skillMd).toContain("## Steps");
  });

  it("preserves metadata as comment by default", () => {
    const result = convertToClaudeCode(basicOC, new Map());
    expect(result.skillMd).toContain("skillport:platform_meta");
    expect(result.skillMd).toContain("openclaw_requires");
    expect(result.skillMd).toContain(">=1.0.0");
  });

  it("preserves install steps in metadata", () => {
    const md = `---
name: My Tool
description: A tool
metadata:
  openclaw:
    requires: ">=1.0.0"
    install:
      - npm install something
      - pip install other
---

## Instructions
Use the tool.
`;
    const result = convertToClaudeCode(md, new Map());
    expect(result.skillMd).toContain("openclaw_install");
    expect(result.warnings.some((w) => w.type === "install")).toBe(true);
  });

  it("stores original name when converting to kebab-case", () => {
    const result = convertToClaudeCode(basicOC, new Map());
    expect(result.skillMd).toContain("original_name");
    expect(result.skillMd).toContain("Git Commit Helper");
  });

  it("does not store original_name when already kebab-case", () => {
    const md = `---
name: already-kebab
description: test
---

Body.
`;
    const result = convertToClaudeCode(md, new Map());
    expect(result.skillMd).not.toContain("original_name");
  });

  it("infers tools when --infer-tools is set", () => {
    const md = `---
name: Code Reviewer
description: Reviews code
---

## Instructions

1. Read the file at the specified path
2. Run \`git diff\` to check changes
3. Search for TODO comments
4. Edit the file to fix issues
`;
    const result = convertToClaudeCode(md, new Map(), { inferTools: true });
    expect(result.skillMd).toContain("allowed-tools:");
    // Should infer at least Bash (git), Read, Grep/Glob, Edit
    const toolsMatch = result.skillMd.match(/allowed-tools:\s*(.+)/);
    expect(toolsMatch).not.toBeNull();
  });

  it("does not infer tools by default", () => {
    const result = convertToClaudeCode(basicOC, new Map());
    expect(result.skillMd).not.toContain("allowed-tools:");
  });

  it("skips metadata when preserveMeta is false", () => {
    const result = convertToClaudeCode(basicOC, new Map(), { preserveMeta: false });
    expect(result.skillMd).not.toContain("skillport:platform_meta");
  });

  it("passes through files unchanged", () => {
    const files = new Map<string, Buffer>([
      ["helper.sh", Buffer.from("#!/bin/bash\necho hello")],
    ]);
    const result = convertToClaudeCode(basicOC, files);
    expect(result.files.has("helper.sh")).toBe(true);
  });

  it("handles skill with no description", () => {
    const md = `---
name: Simple
---

Body.
`;
    const result = convertToClaudeCode(md, new Map());
    expect(result.skillMd).toContain("name: simple");
    expect(result.skillMd).not.toContain("description:");
  });
});

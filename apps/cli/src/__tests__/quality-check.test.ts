import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectCliDeps,
  checkFileReferences,
  checkStructure,
  depsToManifest,
  runQualityCheck,
} from "../utils/quality-check.js";

// Mock binaryExists so tests don't depend on system state
vi.mock("../utils/env-detect.js", () => ({
  binaryExists: (name: string) => {
    const installed = new Set(["git", "node", "npm", "python3", "curl"]);
    return installed.has(name);
  },
}));

describe("detectCliDeps", () => {
  it("detects tools in backtick commands", () => {
    const content = "Run `git commit -m 'msg'` to save changes.";
    const deps = detectCliDeps(content, "SKILL.md");

    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe("git");
    expect(deps[0].available).toBe(true);
  });

  it("detects tools in shebang lines", () => {
    const content = "#!/usr/bin/env python3\nimport sys\nprint('hello')";
    const deps = detectCliDeps(content, "script.py");

    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe("python3");
    expect(deps[0].available).toBe(true);
  });

  it("detects tools in shell command patterns", () => {
    const content = "$ curl -s https://api.example.com\n$ npm install lodash";
    const deps = detectCliDeps(content, "SKILL.md");

    expect(deps.some((d) => d.name === "curl")).toBe(true);
    expect(deps.some((d) => d.name === "npm")).toBe(true);
  });

  it("deduplicates tools found multiple times", () => {
    const content = "`git status` and then `git push`";
    const deps = detectCliDeps(content, "SKILL.md");

    expect(deps.filter((d) => d.name === "git")).toHaveLength(1);
  });

  it("reports unavailable tools", () => {
    const content = "Run `docker build .` to create image.";
    const deps = detectCliDeps(content, "SKILL.md");

    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe("docker");
    expect(deps[0].available).toBe(false);
  });

  it("ignores non-tool words in backticks", () => {
    const content = "`hello_world` is a greeting. `SKILL.md` is the main file.";
    const deps = detectCliDeps(content, "SKILL.md");

    expect(deps).toHaveLength(0);
  });

  it("sets source correctly", () => {
    const deps = detectCliDeps("`git log`", "scripts/deploy.sh");

    expect(deps[0].source).toBe("scripts/deploy.sh");
  });
});

describe("checkFileReferences", () => {
  it("finds broken references", () => {
    const skillMd = "Use `scripts/deploy.sh` to deploy.";
    const payloadFiles = ["scripts/build.sh"];

    const broken = checkFileReferences(skillMd, payloadFiles);

    expect(broken).toHaveLength(1);
    expect(broken[0].ref).toBe("scripts/deploy.sh");
  });

  it("returns empty for valid references", () => {
    const skillMd = "Use `scripts/deploy.sh` to deploy.";
    const payloadFiles = ["scripts/deploy.sh"];

    const broken = checkFileReferences(skillMd, payloadFiles);

    expect(broken).toHaveLength(0);
  });

  it("accepts payload/-prefixed files", () => {
    const skillMd = "Use `scripts/test.sh` for testing.";
    const payloadFiles = ["payload/scripts/test.sh"];

    const broken = checkFileReferences(skillMd, payloadFiles);

    expect(broken).toHaveLength(0);
  });

  it("detects path patterns without backticks", () => {
    const skillMd = "## Deploy\nRun scripts/deploy.sh to deploy.";
    const payloadFiles: string[] = [];

    const broken = checkFileReferences(skillMd, payloadFiles);

    expect(broken.some((b) => b.ref === "scripts/deploy.sh")).toBe(true);
  });

  it("includes section context in source", () => {
    const skillMd = "## Deployment\n\nUse `scripts/deploy.sh` to deploy.";
    const payloadFiles: string[] = [];

    const broken = checkFileReferences(skillMd, payloadFiles);

    expect(broken[0].source).toContain("Deployment");
  });
});

describe("checkStructure", () => {
  it("reports missing title", () => {
    const issues = checkStructure("No title here, just text.", 1);

    expect(issues.some((i) => i.message.includes("title"))).toBe(true);
  });

  it("reports very short content", () => {
    const issues = checkStructure("# Title\n\nShort.\n", 1);

    expect(issues.some((i) => i.message.includes("short"))).toBe(true);
  });

  it("suggests sections for long documents", () => {
    const lines = ["# Long Skill", "", ...Array(25).fill("Some instruction line.")];
    const issues = checkStructure(lines.join("\n"), 3);

    expect(issues.some((i) => i.message.includes("section"))).toBe(true);
  });

  it("reports missing intro text", () => {
    const issues = checkStructure("# Title\n## Section\nContent", 2);

    expect(issues.some((i) => i.message.includes("description"))).toBe(true);
  });

  it("notes missing frontmatter as info", () => {
    const issues = checkStructure("# Title\n\nA good description.\n\n## Feature\nDoes stuff.", 2);

    const fmIssue = issues.find((i) => i.message.includes("frontmatter"));
    expect(fmIssue).toBeDefined();
    expect(fmIssue!.severity).toBe("info");
  });

  it("passes well-structured skill", () => {
    const good = `---
name: good-skill
description: A well-structured skill
---

# Good Skill

A comprehensive skill for doing things well.

## Feature A

Does feature A with detail.

## Feature B

Does feature B with detail.
`;
    const issues = checkStructure(good, 3);
    const errors = issues.filter((i) => i.severity === "error");

    expect(errors).toHaveLength(0);
  });
});

describe("depsToManifest", () => {
  it("converts detected deps to manifest format", () => {
    const deps = [
      { name: "git", source: "SKILL.md", available: true },
      { name: "docker", source: "SKILL.md", available: false },
    ];
    const manifest = depsToManifest(deps);

    expect(manifest).toHaveLength(2);
    expect(manifest[0]).toEqual({ name: "git", type: "cli", optional: false });
    expect(manifest[1]).toEqual({ name: "docker", type: "cli", optional: false });
  });
});

describe("runQualityCheck", () => {
  it("produces a full quality report", () => {
    const files = new Map<string, Buffer>();
    files.set("SKILL.md", Buffer.from(`---
name: test-skill
---

# Test Skill

A test skill for quality checking.

## Git Feature

Use \`git log\` to show history.

## Docker Feature

Run \`docker build .\` in the project directory.
`));
    files.set("scripts/helper.sh", Buffer.from("#!/bin/bash\ngit status"));

    const report = runQualityCheck(
      files.get("SKILL.md")!.toString("utf-8"),
      files,
    );

    expect(report.detectedDeps.length).toBeGreaterThan(0);
    expect(report.detectedDeps.some((d) => d.name === "git")).toBe(true);
    expect(report.detectedDeps.some((d) => d.name === "docker")).toBe(true);
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  it("reports broken file references", () => {
    const files = new Map<string, Buffer>();
    files.set("SKILL.md", Buffer.from("# Skill\n\nSome intro text.\n\nUse `scripts/missing.sh` to run."));

    const report = runQualityCheck(
      files.get("SKILL.md")!.toString("utf-8"),
      files,
    );

    expect(report.brokenRefs).toHaveLength(1);
    expect(report.brokenRefs[0].ref).toBe("scripts/missing.sh");
    expect(report.passed).toBe(false);
  });

  it("gives high score for well-structured skill", () => {
    const files = new Map<string, Buffer>();
    files.set("SKILL.md", Buffer.from(`---
name: good-skill
description: Good
---

# Good Skill

A well-structured skill.

## Feature

Use \`git status\` to check state.
`));
    files.set("configs/setup.json", Buffer.from("{}"));

    const report = runQualityCheck(
      files.get("SKILL.md")!.toString("utf-8"),
      files,
    );

    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(report.passed).toBe(true);
  });
});

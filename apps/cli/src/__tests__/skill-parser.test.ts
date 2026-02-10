import { describe, it, expect } from "vitest";
import {
  parseSkillMd,
  reconstructSkillMd,
  sectionSummary,
} from "../utils/skill-parser.js";

const SAMPLE_SKILL = `---
name: multi-tool
description: A multi-feature skill
---

# Multi Tool

A skill with multiple features.

## Git Summary

Generate a summary of recent git commits.

Uses \`scripts/summarize.sh\` to collect data.

## Slack Notification

Send notifications to Slack channels.

Requires \`scripts/slack.py\` and \`SLACK_TOKEN\` env var.

## CI Integration

Integrate with CI/CD pipelines.

Run \`scripts/ci.yaml\` for pipeline config.
`;

const SIMPLE_SKILL = `# Simple Skill

A skill with no sections, just a description.

This is a simple skill that does one thing.
`;

const NO_FRONTMATTER = `# No Frontmatter Skill

## Feature A

Does feature A.

## Feature B

Does feature B.
`;

describe("parseSkillMd", () => {
  it("parses frontmatter, header, and sections", () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);

    expect(parsed.frontmatter).toContain("name: multi-tool");
    expect(parsed.header).toContain("# Multi Tool");
    expect(parsed.header).toContain("A skill with multiple features.");
    expect(parsed.sections).toHaveLength(3);
    expect(parsed.sections[0].heading).toBe("Git Summary");
    expect(parsed.sections[1].heading).toBe("Slack Notification");
    expect(parsed.sections[2].heading).toBe("CI Integration");
  });

  it("handles skill with no sections", () => {
    const parsed = parseSkillMd(SIMPLE_SKILL);

    expect(parsed.frontmatter).toBe("");
    expect(parsed.header).toContain("# Simple Skill");
    expect(parsed.sections).toHaveLength(0);
  });

  it("handles skill without frontmatter", () => {
    const parsed = parseSkillMd(NO_FRONTMATTER);

    expect(parsed.frontmatter).toBe("");
    expect(parsed.header).toContain("# No Frontmatter Skill");
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0].heading).toBe("Feature A");
    expect(parsed.sections[1].heading).toBe("Feature B");
  });

  it("extracts file references from sections", () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);

    expect(parsed.sections[0].referencedFiles).toContain("scripts/summarize.sh");
    expect(parsed.sections[1].referencedFiles).toContain("scripts/slack.py");
    expect(parsed.sections[2].referencedFiles).toContain("scripts/ci.yaml");
  });
});

describe("reconstructSkillMd", () => {
  it("includes only selected sections", () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const result = reconstructSkillMd(parsed, [0, 2]); // Git Summary + CI Integration

    expect(result).toContain("# Multi Tool");
    expect(result).toContain("## Git Summary");
    expect(result).not.toContain("## Slack Notification");
    expect(result).toContain("## CI Integration");
  });

  it("preserves frontmatter", () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const result = reconstructSkillMd(parsed, [0]);

    expect(result).toContain("---");
    expect(result).toContain("name: multi-tool");
    expect(result).toContain("## Git Summary");
  });

  it("handles selecting all sections", () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const result = reconstructSkillMd(parsed, [0, 1, 2]);

    expect(result).toContain("## Git Summary");
    expect(result).toContain("## Slack Notification");
    expect(result).toContain("## CI Integration");
  });

  it("handles selecting single section", () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const result = reconstructSkillMd(parsed, [1]);

    expect(result).toContain("# Multi Tool");
    expect(result).toContain("## Slack Notification");
    expect(result).not.toContain("## Git Summary");
    expect(result).not.toContain("## CI Integration");
  });
});

describe("sectionSummary", () => {
  it("returns first content line as summary", () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const summary = sectionSummary(parsed.sections[0]);

    expect(summary).toBe("Generate a summary of recent git commits.");
  });

  it("truncates long summaries", () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const summary = sectionSummary(parsed.sections[0], 20);

    expect(summary.length).toBeLessThanOrEqual(20);
    expect(summary).toContain("...");
  });

  it("returns empty string for section with no content", () => {
    const parsed = parseSkillMd("## Empty\n\n## Next\nContent");
    const summary = sectionSummary(parsed.sections[0]);

    expect(summary).toBe("");
  });
});

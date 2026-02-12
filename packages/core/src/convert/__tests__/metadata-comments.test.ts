import { describe, it, expect } from "vitest";
import {
  extractPlatformMeta,
  embedPlatformMeta,
  embedDynamicContextComment,
  extractDynamicContextMeta,
  stripMetadataComments,
} from "../metadata-comments.js";

describe("extractPlatformMeta", () => {
  it("extracts valid metadata comment", () => {
    const md = `---
name: test
---

<!-- skillport:platform_meta
skillport_meta_version: 1
generated_by: "skillport@1.0.0"
openclaw_requires: ">=1.0.0"
-->

## Body
`;
    const result = extractPlatformMeta(md);
    expect(result.meta).not.toBeNull();
    expect(result.meta!.skillport_meta_version).toBe(1);
    expect(result.meta!.generated_by).toBe("skillport@1.0.0");
    expect(result.meta!.openclaw_requires).toBe(">=1.0.0");
    expect(result.warnings).toHaveLength(0);
  });

  it("returns null when no comment present", () => {
    const result = extractPlatformMeta("---\nname: test\n---\n\nBody");
    expect(result.meta).toBeNull();
    expect(result.warnings).toHaveLength(0);
  });

  it("warns on duplicate comments (first wins)", () => {
    const md = `<!-- skillport:platform_meta
skillport_meta_version: 1
generated_by: "skillport@1.0.0"
foo: "first"
-->

<!-- skillport:platform_meta
skillport_meta_version: 1
foo: "second"
-->`;
    const result = extractPlatformMeta(md);
    expect(result.meta).not.toBeNull();
    expect(result.meta!.foo).toBe("first");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Multiple");
  });

  it("warns on missing meta_version (treats as legacy)", () => {
    const md = `<!-- skillport:platform_meta
generated_by: "skillport@0.9.0"
some_field: "value"
-->`;
    const result = extractPlatformMeta(md);
    expect(result.meta).not.toBeNull();
    expect(result.meta!.skillport_meta_version).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("legacy");
  });

  it("warns on future meta_version but parses anyway", () => {
    const md = `<!-- skillport:platform_meta
skillport_meta_version: 99
generated_by: "skillport@99.0.0"
new_field: "future"
-->`;
    const result = extractPlatformMeta(md);
    expect(result.meta).not.toBeNull();
    expect(result.meta!.new_field).toBe("future");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("newer SkillPort");
  });

  it("preserves unknown fields (forward compat)", () => {
    const md = `<!-- skillport:platform_meta
skillport_meta_version: 1
generated_by: "skillport@1.0.0"
unknown_future_field: "keep me"
-->`;
    const result = extractPlatformMeta(md);
    expect(result.meta!.unknown_future_field).toBe("keep me");
  });

  it("handles YAML parse error gracefully", () => {
    // The parser is simple enough that it won't actually crash, but
    // let's test with weird content
    const md = `<!-- skillport:platform_meta
:::invalid:::
-->`;
    const result = extractPlatformMeta(md);
    // Simple parser returns empty object for unrecognized lines
    expect(result.warnings).toHaveLength(1); // missing meta_version warning
  });

  it("parses array fields", () => {
    const md = `<!-- skillport:platform_meta
skillport_meta_version: 1
allowed_tools: ["Read", "Grep", "Glob"]
-->`;
    const result = extractPlatformMeta(md);
    expect(result.meta!.allowed_tools).toEqual(["Read", "Grep", "Glob"]);
  });

  it("parses multiline array fields", () => {
    const md = `<!-- skillport:platform_meta
skillport_meta_version: 1
openclaw_install:
  - npm install something
  - pip install other
-->`;
    const result = extractPlatformMeta(md);
    expect(result.meta!.openclaw_install).toEqual(["npm install something", "pip install other"]);
  });

  it("parses boolean values", () => {
    const md = `<!-- skillport:platform_meta
skillport_meta_version: 1
user_invocable: true
has_dynamic_context: false
-->`;
    const result = extractPlatformMeta(md);
    expect(result.meta!.user_invocable).toBe(true);
    expect(result.meta!.has_dynamic_context).toBe(false);
  });
});

describe("embedPlatformMeta", () => {
  it("inserts meta comment after frontmatter", () => {
    const md = "---\nname: test\n---\n\n## Body\n";
    const result = embedPlatformMeta(md, { foo: "bar" });
    expect(result).toContain("<!-- skillport:platform_meta");
    expect(result).toContain("skillport_meta_version: 1");
    expect(result).toContain('foo: "bar"');
    expect(result).toContain("## Body");
    // Meta should appear between frontmatter and body
    const metaIdx = result.indexOf("skillport:platform_meta");
    const bodyIdx = result.indexOf("## Body");
    expect(metaIdx).toBeLessThan(bodyIdx);
  });

  it("replaces existing meta comment", () => {
    const md = `---
name: test
---

<!-- skillport:platform_meta
skillport_meta_version: 1
old_field: "old"
-->

## Body
`;
    const result = embedPlatformMeta(md, { new_field: "new" });
    expect(result).not.toContain("old_field");
    expect(result).toContain("new_field");
    // Should only have one meta comment
    const count = (result.match(/skillport:platform_meta/g) || []).length;
    expect(count).toBe(1);
  });

  it("prepends when no frontmatter", () => {
    const md = "# Title\n\nBody.";
    const result = embedPlatformMeta(md, { test: true });
    expect(result.startsWith("<!-- skillport:platform_meta")).toBe(true);
  });
});

describe("embedDynamicContextComment", () => {
  it("embeds dynamic context warning", () => {
    const md = "---\nname: test\n---\n\n## Body\n";
    const result = embedDynamicContextComment(md, ["git diff", "gh pr view"]);
    expect(result).toContain("skillport:dynamic_context");
    expect(result).toContain("!`git diff`");
    expect(result).toContain("!`gh pr view`");
  });

  it("returns unchanged when no commands", () => {
    const md = "---\nname: test\n---\n\n## Body\n";
    expect(embedDynamicContextComment(md, [])).toBe(md);
  });
});

describe("extractDynamicContextMeta", () => {
  it("extracts commands from dynamic context comment", () => {
    const md = `<!-- skillport:dynamic_context
WARNING: Dynamic context commands cannot be executed in OpenClaw.
Original commands:
- !\`git diff\`
- !\`gh pr view\`
-->`;
    const result = extractDynamicContextMeta(md);
    expect(result).not.toBeNull();
    expect(result!.commands).toEqual(["git diff", "gh pr view"]);
  });

  it("returns null when no comment", () => {
    expect(extractDynamicContextMeta("No dynamic context here.")).toBeNull();
  });
});

describe("stripMetadataComments", () => {
  it("removes both platform_meta and dynamic_context comments", () => {
    const md = `---
name: test
---

<!-- skillport:platform_meta
skillport_meta_version: 1
-->

<!-- skillport:dynamic_context
WARNING: test
- !\`git diff\`
-->

## Body
Content here.
`;
    const result = stripMetadataComments(md);
    expect(result).not.toContain("skillport:platform_meta");
    expect(result).not.toContain("skillport:dynamic_context");
    expect(result).toContain("## Body");
    expect(result).toContain("Content here.");
  });
});

import { describe, it, expect } from "vitest";
import { ManifestSchema } from "../manifest/schema.js";

function validManifest() {
  return {
    ssp_version: "1.0" as const,
    id: "test-author/test-skill",
    name: "Test Skill",
    description: "A test skill",
    version: "1.0.0",
    author: {
      name: "Test Author",
      signing_key_id: "abcdef1234567890",
    },
    openclaw_compat: ">=1.0.0",
    os_compat: ["macos" as const, "linux" as const],
    entrypoints: [{ name: "main", file: "SKILL.md" }],
    permissions: {
      network: { mode: "none" as const },
      filesystem: { read_paths: [], write_paths: [] },
      exec: { allowed_commands: [], shell: false },
    },
    dependencies: [],
    danger_flags: [],
    install: { steps: [], required_inputs: [] },
    hashes: {},
    created_at: new Date().toISOString(),
  };
}

describe("ManifestSchema", () => {
  it("validates a correct manifest", () => {
    const result = ManifestSchema.safeParse(validManifest());
    expect(result.success).toBe(true);
  });

  it("rejects invalid ssp_version", () => {
    const m = { ...validManifest(), ssp_version: "2.0" };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(false);
  });

  it("rejects invalid skill id format", () => {
    const m = { ...validManifest(), id: "invalid" };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(false);
  });

  it("accepts valid skill id", () => {
    const m = { ...validManifest(), id: "my-author/my-skill" };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(true);
  });

  it("rejects invalid semver", () => {
    const m = { ...validManifest(), version: "1.0" };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(false);
  });

  it("validates network allowlist permissions", () => {
    const m = validManifest();
    m.permissions.network = {
      mode: "allowlist",
      domains: ["api.example.com"],
    };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(true);
  });

  it("validates danger flags", () => {
    const m = validManifest();
    m.danger_flags = [
      {
        code: "SEC001",
        severity: "high",
        message: "Test issue",
        file: "test.ts",
        line: 10,
      },
    ];
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(true);
  });

  it("requires at least one entrypoint", () => {
    const m = { ...validManifest(), entrypoints: [] };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(false);
  });

  // --- Platform field tests ---
  it("defaults platform to openclaw when omitted", () => {
    const result = ManifestSchema.safeParse(validManifest());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.platform).toBe("openclaw");
    }
  });

  it("accepts platform: claude-code with claude_code metadata", () => {
    const m = {
      ...validManifest(),
      platform: "claude-code",
      claude_code: {
        user_invocable: true,
        allowed_tools: ["Read", "Grep"],
        argument_hint: "[file-path]",
        context: "fork" as const,
      },
    };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(true);
  });

  it("accepts platform: universal with both metadata", () => {
    const m = {
      ...validManifest(),
      platform: "universal",
      openclaw: { requires: ">=1.0.0", install_steps: ["npm install foo"] },
      claude_code: { user_invocable: true, allowed_tools: ["Read"] },
    };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(true);
  });

  it("rejects invalid platform value", () => {
    const m = { ...validManifest(), platform: "invalid" };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(false);
  });

  it("backward compat: openclaw_compat is optional", () => {
    const m = validManifest();
    delete (m as Record<string, unknown>).openclaw_compat;
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(true);
  });

  // --- Agent-native fields (Phase 7C) ---
  it("backward compat: new agent-native fields default when omitted", () => {
    // Existing manifests without inputs/outputs/scope should still parse
    const result = ManifestSchema.safeParse(validManifest());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inputs).toEqual([]);
      expect(result.data.outputs).toEqual([]);
      expect(result.data.scope).toEqual({
        files: false,
        network: false,
        processes: false,
        env_vars: false,
      });
      expect(result.data.declared_risk).toBe("medium");
      expect(result.data.estimated_duration_seconds).toBeUndefined();
      expect(result.data.estimated_tokens).toBeUndefined();
    }
  });

  it("accepts manifest with inputs and outputs", () => {
    const m = {
      ...validManifest(),
      inputs: [
        {
          name: "repo_url",
          type: "string",
          description: "Git repository URL",
          required: true,
        },
        {
          name: "verbose",
          type: "boolean",
          description: "Enable verbose output",
          required: false,
        },
      ],
      outputs: [
        {
          name: "result",
          type: "json",
          description: "Pipeline result",
          schema: { type: "object" },
        },
        {
          name: "log_file",
          type: "file",
          description: "Execution log",
        },
      ],
    };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inputs).toHaveLength(2);
      expect(result.data.outputs).toHaveLength(2);
      expect(result.data.inputs[0].name).toBe("repo_url");
      expect(result.data.outputs[0].schema).toEqual({ type: "object" });
    }
  });

  it("accepts manifest with scope declaration", () => {
    const m = {
      ...validManifest(),
      scope: {
        files: true,
        network: true,
        processes: false,
        env_vars: true,
      },
    };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope.files).toBe(true);
      expect(result.data.scope.network).toBe(true);
      expect(result.data.scope.processes).toBe(false);
    }
  });

  it("accepts estimated_duration_seconds and estimated_tokens", () => {
    const m = {
      ...validManifest(),
      estimated_duration_seconds: 30,
      estimated_tokens: 5000,
    };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimated_duration_seconds).toBe(30);
      expect(result.data.estimated_tokens).toBe(5000);
    }
  });

  it("accepts declared_risk levels", () => {
    for (const risk of ["low", "medium", "high"]) {
      const m = { ...validManifest(), declared_risk: risk };
      const result = ManifestSchema.safeParse(m);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid declared_risk", () => {
    const m = { ...validManifest(), declared_risk: "extreme" };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(false);
  });

  it("rejects invalid input type", () => {
    const m = {
      ...validManifest(),
      inputs: [{ name: "x", type: "binary", description: "bad" }],
    };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(false);
  });

  it("rejects invalid output type", () => {
    const m = {
      ...validManifest(),
      outputs: [{ name: "x", type: "stream", description: "bad" }],
    };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(false);
  });
});

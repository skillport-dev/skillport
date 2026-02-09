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
});

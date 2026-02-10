import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectOS,
  binaryExists,
  envVarExists,
  checkEnvironment,
  findIncompatibleSections,
} from "../utils/env-detect.js";
import type { Manifest } from "@skillport/core";

// Minimal manifest factory for testing
function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    ssp_version: "1.0",
    id: "test/skill",
    name: "Test Skill",
    description: "A test skill",
    version: "1.0.0",
    author: { name: "Test", signing_key_id: "key-123" },
    openclaw_compat: ">=1.0.0",
    os_compat: ["macos", "linux"],
    entrypoints: [{ name: "main", file: "SKILL.md" }],
    permissions: {
      network: { mode: "none" },
      filesystem: { read_paths: [], write_paths: [] },
      exec: { allowed_commands: [], shell: false },
    },
    dependencies: [],
    danger_flags: [],
    install: { steps: [], required_inputs: [] },
    hashes: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("detectOS", () => {
  it("returns a string", () => {
    const os = detectOS();
    expect(typeof os).toBe("string");
    expect(["macos", "linux", "windows"]).toContain(os);
  });
});

describe("binaryExists", () => {
  it("finds node (should always exist in test env)", () => {
    expect(binaryExists("node")).toBe(true);
  });

  it("returns false for nonexistent binary", () => {
    expect(binaryExists("__nonexistent_binary_xyz__")).toBe(false);
  });
});

describe("envVarExists", () => {
  it("returns true for PATH (always set)", () => {
    expect(envVarExists("PATH")).toBe(true);
  });

  it("returns false for unset variable", () => {
    expect(envVarExists("__SKILLPORT_TEST_NONEXISTENT__")).toBe(false);
  });
});

describe("checkEnvironment", () => {
  it("reports OS compatibility", () => {
    const manifest = makeManifest({ os_compat: ["macos", "linux"] });
    const report = checkEnvironment(manifest);
    expect(report.os.compatible).toBe(true);
  });

  it("reports OS incompatibility", () => {
    const manifest = makeManifest({ os_compat: ["windows"] });
    const report = checkEnvironment(manifest);
    // CI may run on macos or linux, not windows
    if (detectOS() !== "windows") {
      expect(report.os.compatible).toBe(false);
      expect(report.ready).toBe(false);
    }
  });

  it("checks binary dependencies", () => {
    const manifest = makeManifest({
      dependencies: [
        { name: "node", type: "cli" },
        { name: "__missing_tool__", type: "cli" },
      ],
    });
    const report = checkEnvironment(manifest);
    expect(report.binaries).toHaveLength(2);
    expect(report.binaries[0].status).toBe("ok"); // node exists
    expect(report.binaries[1].status).toBe("missing");
    expect(report.ready).toBe(false); // missing non-optional dep
  });

  it("treats optional deps as warn, not blocking", () => {
    const manifest = makeManifest({
      dependencies: [
        { name: "__optional_tool__", type: "cli", optional: true },
      ],
    });
    const report = checkEnvironment(manifest);
    expect(report.binaries[0].status).toBe("warn");
    expect(report.ready).toBe(true); // optional missing doesn't block
  });

  it("reports ready when no deps required", () => {
    const manifest = makeManifest();
    const report = checkEnvironment(manifest);
    expect(report.ready).toBe(true);
  });
});

describe("findIncompatibleSections", () => {
  it("finds sections referencing missing binaries", () => {
    const sections = [
      "## Git Summary\nUse git to summarize commits.",
      "## Docker Deploy\nRequires docker and docker-compose to deploy.",
      "## Documentation\nGenerate docs from comments.",
    ];
    const result = findIncompatibleSections(sections, ["docker"]);
    expect(result).toEqual([1]);
  });

  it("returns empty when no missing binaries", () => {
    const sections = [
      "## Feature A\nDoes something.",
      "## Feature B\nDoes something else.",
    ];
    const result = findIncompatibleSections(sections, []);
    expect(result).toEqual([]);
  });

  it("matches case-insensitively", () => {
    const sections = [
      "## Slack Integration\nUses SLACK_CLI to send messages.",
    ];
    const result = findIncompatibleSections(sections, ["slack_cli"]);
    expect(result).toEqual([0]);
  });

  it("finds multiple incompatible sections", () => {
    const sections = [
      "## Local\nJust reads files.",
      "## Redis Cache\nNeeds redis-server running.",
      "## Postgres\nNeeds psql client.",
    ];
    const result = findIncompatibleSections(sections, ["redis-server", "psql"]);
    expect(result).toEqual([1, 2]);
  });
});

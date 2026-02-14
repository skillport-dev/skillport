import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "skillport-policy-test-" + Date.now());
const testHome = join(testDir, "home");

// Mock node:os to control homedir
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    homedir: () => testHome,
  };
});

// We also mock @skillport/shared to avoid build dependency
vi.mock("@skillport/shared", () => ({
  SP_CONFIG_DIR: ".skillport",
}));

import { loadPolicy, checkPolicy, isHostAllowed } from "../utils/policy.js";

const originalCwd = process.cwd;

beforeEach(() => {
  mkdirSync(join(testHome, ".skillport"), { recursive: true });
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true });
  }
  process.cwd = originalCwd;
});

describe("loadPolicy", () => {
  it("returns default policy when no .skillportrc exists", () => {
    process.cwd = () => join(testDir, "empty");

    const policy = loadPolicy();
    expect(policy.allowed_hosts).toEqual([]);
    expect(policy.workspace_boundary).toBe(false);
    expect(policy.requires_approval).toEqual([]);
    expect(policy.auto_install.max_risk_score).toBe(30);
    expect(policy.auto_install.require_platform_sig).toBe(false);
    expect(policy.auto_install.max_per_session).toBe(5);
  });

  it("loads project-local .skillportrc", () => {
    const projectDir = join(testDir, "project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".skillportrc"),
      JSON.stringify({
        policy: {
          allowed_hosts: ["github.com"],
          requires_approval: ["uninstall", "publish"],
          auto_install: {
            max_risk_score: 20,
            require_platform_sig: false,
          },
        },
      }),
    );

    process.cwd = () => projectDir;

    const loaded = loadPolicy();
    expect(loaded.allowed_hosts).toEqual(["github.com"]);
    expect(loaded.requires_approval).toEqual(["uninstall", "publish"]);
    expect(loaded.auto_install.max_risk_score).toBe(20);
    expect(loaded.auto_install.require_platform_sig).toBe(false);
    expect(loaded.auto_install.max_per_session).toBe(5); // default preserved
  });

  it("falls back to global .skillportrc when no local one exists", () => {
    writeFileSync(
      join(testHome, ".skillport", ".skillportrc"),
      JSON.stringify({
        policy: {
          workspace_boundary: true,
          requires_approval: ["manage:delete"],
        },
      }),
    );

    process.cwd = () => join(testDir, "no-local-config");

    const loaded = loadPolicy();
    expect(loaded.workspace_boundary).toBe(true);
    expect(loaded.requires_approval).toEqual(["manage:delete"]);
  });

  it("prefers local over global .skillportrc", () => {
    // Global
    writeFileSync(
      join(testHome, ".skillport", ".skillportrc"),
      JSON.stringify({
        policy: { requires_approval: ["from-global"] },
      }),
    );

    // Local
    const projectDir = join(testDir, "project2");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".skillportrc"),
      JSON.stringify({
        policy: { requires_approval: ["from-local"] },
      }),
    );

    process.cwd = () => projectDir;

    const loaded = loadPolicy();
    expect(loaded.requires_approval).toEqual(["from-local"]);
  });

  it("uses defaults when .skillportrc is invalid JSON", () => {
    const projectDir = join(testDir, "bad-json");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, ".skillportrc"), "not json {{{");

    process.cwd = () => projectDir;

    const loaded = loadPolicy();
    expect(loaded.requires_approval).toEqual([]);
    expect(loaded.auto_install.max_risk_score).toBe(30);
  });
});

describe("checkPolicy", () => {
  it("allows actions by default", () => {
    process.cwd = () => join(testDir, "empty");

    const result = checkPolicy("install", { nonInteractive: true, riskScore: 10 });
    expect(result.allowed).toBe(true);
  });

  it("blocks requires_approval actions in non-interactive mode", () => {
    const projectDir = join(testDir, "policy-approval");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".skillportrc"),
      JSON.stringify({
        policy: { requires_approval: ["uninstall"] },
      }),
    );
    process.cwd = () => projectDir;

    const result = checkPolicy("uninstall", { nonInteractive: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("requires approval");
    expect(result.hints!.length).toBeGreaterThan(0);
  });

  it("allows requires_approval actions in interactive mode", () => {
    const projectDir = join(testDir, "policy-approval-interactive");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".skillportrc"),
      JSON.stringify({
        policy: { requires_approval: ["uninstall"] },
      }),
    );
    process.cwd = () => projectDir;

    const result = checkPolicy("uninstall", { nonInteractive: false });
    expect(result.allowed).toBe(true);
  });

  it("blocks install when risk_score exceeds max_risk_score", () => {
    const projectDir = join(testDir, "policy-risk");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".skillportrc"),
      JSON.stringify({
        policy: { auto_install: { max_risk_score: 15 } },
      }),
    );
    process.cwd = () => projectDir;

    const result = checkPolicy("install", { nonInteractive: true, riskScore: 20 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("exceeds policy limit");
  });

  it("allows install when risk_score is within limit", () => {
    const projectDir = join(testDir, "policy-risk-ok");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".skillportrc"),
      JSON.stringify({
        policy: { auto_install: { max_risk_score: 50 } },
      }),
    );
    process.cwd = () => projectDir;

    const result = checkPolicy("install", { nonInteractive: true, riskScore: 20 });
    expect(result.allowed).toBe(true);
  });

  it("blocks install when platform sig required but absent", () => {
    const projectDir = join(testDir, "policy-sig");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".skillportrc"),
      JSON.stringify({
        policy: { auto_install: { require_platform_sig: true } },
      }),
    );
    process.cwd = () => projectDir;

    const result = checkPolicy("install", { nonInteractive: true, hasPlatformSig: false });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("platform signature");
  });

  it("blocks install when session limit reached", () => {
    const projectDir = join(testDir, "policy-session");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".skillportrc"),
      JSON.stringify({
        policy: { auto_install: { max_per_session: 2 } },
      }),
    );
    process.cwd = () => projectDir;

    const result = checkPolicy("install", { nonInteractive: true, sessionInstallCount: 2 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Session install limit");
  });

  it("does not apply auto_install rules to interactive installs", () => {
    const projectDir = join(testDir, "policy-interactive");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".skillportrc"),
      JSON.stringify({
        policy: { auto_install: { max_risk_score: 5 } },
      }),
    );
    process.cwd = () => projectDir;

    const result = checkPolicy("install", { nonInteractive: false, riskScore: 99 });
    expect(result.allowed).toBe(true);
  });

  it("checks manage:delete action against policy", () => {
    const projectDir = join(testDir, "policy-manage");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".skillportrc"),
      JSON.stringify({
        policy: { requires_approval: ["manage:delete"] },
      }),
    );
    process.cwd = () => projectDir;

    const blocked = checkPolicy("manage:delete", { nonInteractive: true });
    expect(blocked.allowed).toBe(false);

    const allowed = checkPolicy("manage:publish", { nonInteractive: true });
    expect(allowed.allowed).toBe(true);
  });
});

describe("isHostAllowed", () => {
  it("allows all hosts when allowed_hosts is empty", () => {
    process.cwd = () => join(testDir, "empty");

    expect(isHostAllowed("example.com")).toBe(true);
    expect(isHostAllowed("any.host")).toBe(true);
  });

  it("restricts hosts when allowed_hosts is set", () => {
    const projectDir = join(testDir, "policy-hosts");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".skillportrc"),
      JSON.stringify({
        policy: { allowed_hosts: ["github.com", "api.openai.com"] },
      }),
    );
    process.cwd = () => projectDir;

    expect(isHostAllowed("github.com")).toBe(true);
    expect(isHostAllowed("api.openai.com")).toBe(true);
    expect(isHostAllowed("evil.com")).toBe(false);
  });
});

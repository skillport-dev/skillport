import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "skillport-provenance-test-" + Date.now());
const testHome = join(testDir, "home");

// Mock node:os to control homedir
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    homedir: () => testHome,
  };
});

vi.mock("@skillport/shared", () => ({
  SP_CONFIG_DIR: ".skillport",
}));

import {
  logProvenance,
  getSessionId,
  getSessionInstallCount,
  incrementSessionInstallCount,
  resetSession,
  detectAgent,
} from "../utils/provenance.js";

beforeEach(() => {
  mkdirSync(join(testHome, ".skillport"), { recursive: true });
  resetSession();
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true });
  }
});

describe("provenance logging", () => {
  it("writes provenance entry to JSONL file", () => {
    logProvenance({
      action: "install",
      skill_id: "acme/data-pipeline",
      version: "1.2.0",
      agent: "claude-code",
      risk_score: 15,
      install_path: "~/.claude/skills/data-pipeline",
    });

    const logPath = join(testHome, ".skillport", "provenance.jsonl");
    expect(existsSync(logPath)).toBe(true);

    const content = readFileSync(logPath, "utf-8").trim();
    const entry = JSON.parse(content);
    expect(entry.action).toBe("install");
    expect(entry.skill_id).toBe("acme/data-pipeline");
    expect(entry.version).toBe("1.2.0");
    expect(entry.agent).toBe("claude-code");
    expect(entry.risk_score).toBe(15);
    expect(entry.ts).toBeDefined();
    expect(entry.session_id).toBeDefined();
  });

  it("appends multiple entries with same session_id", () => {
    logProvenance({ action: "install", skill_id: "a/b" });
    logProvenance({ action: "uninstall", skill_id: "a/b" });

    const logPath = join(testHome, ".skillport", "provenance.jsonl");
    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(2);

    const entry1 = JSON.parse(lines[0]);
    const entry2 = JSON.parse(lines[1]);
    expect(entry1.session_id).toBe(entry2.session_id);
    expect(entry1.action).toBe("install");
    expect(entry2.action).toBe("uninstall");
  });

  it("includes all optional fields", () => {
    logProvenance({
      action: "install",
      skill_id: "x/y",
      version: "2.0.0",
      agent: "agent",
      risk_score: 5,
      install_path: "/tmp/test",
      source: "marketplace",
      scan_passed: true,
      author_sig_verified: true,
      platform_sig_present: false,
      policy_allowed: true,
      files_written: ["SKILL.md", "scripts/run.sh"],
    });

    const logPath = join(testHome, ".skillport", "provenance.jsonl");
    const entry = JSON.parse(readFileSync(logPath, "utf-8").trim());
    expect(entry.source).toBe("marketplace");
    expect(entry.scan_passed).toBe(true);
    expect(entry.author_sig_verified).toBe(true);
    expect(entry.platform_sig_present).toBe(false);
    expect(entry.files_written).toEqual(["SKILL.md", "scripts/run.sh"]);
  });
});

describe("session tracking", () => {
  it("generates consistent session ID within a session", () => {
    const id1 = getSessionId();
    const id2 = getSessionId();
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("tracks session install count", () => {
    expect(getSessionInstallCount()).toBe(0);
    incrementSessionInstallCount();
    expect(getSessionInstallCount()).toBe(1);
    incrementSessionInstallCount();
    expect(getSessionInstallCount()).toBe(2);
  });

  it("resets session state", () => {
    const id1 = getSessionId();
    incrementSessionInstallCount();

    resetSession();

    const id2 = getSessionId();
    expect(id2).not.toBe(id1);
    expect(getSessionInstallCount()).toBe(0);
  });
});

describe("detectAgent", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.CLAUDE_CODE = process.env.CLAUDE_CODE;
    savedEnv.SKILLPORT_MCP = process.env.SKILLPORT_MCP;
    savedEnv.SKILLPORT_AGENT = process.env.SKILLPORT_AGENT;
    delete process.env.CLAUDE_CODE;
    delete process.env.SKILLPORT_MCP;
    delete process.env.SKILLPORT_AGENT;
  });

  afterEach(() => {
    if (savedEnv.CLAUDE_CODE !== undefined) process.env.CLAUDE_CODE = savedEnv.CLAUDE_CODE;
    else delete process.env.CLAUDE_CODE;
    if (savedEnv.SKILLPORT_MCP !== undefined) process.env.SKILLPORT_MCP = savedEnv.SKILLPORT_MCP;
    else delete process.env.SKILLPORT_MCP;
    if (savedEnv.SKILLPORT_AGENT !== undefined) process.env.SKILLPORT_AGENT = savedEnv.SKILLPORT_AGENT;
    else delete process.env.SKILLPORT_AGENT;
  });

  it("returns 'claude-code' when CLAUDE_CODE env is set", () => {
    process.env.CLAUDE_CODE = "1";
    expect(detectAgent()).toBe("claude-code");
  });

  it("returns 'mcp-client' when SKILLPORT_MCP env is set", () => {
    process.env.SKILLPORT_MCP = "1";
    expect(detectAgent()).toBe("mcp-client");
  });

  it("returns custom agent from SKILLPORT_AGENT env", () => {
    process.env.SKILLPORT_AGENT = "my-bot";
    expect(detectAgent()).toBe("my-bot");
  });

  it("returns 'human' when no env vars set", () => {
    expect(detectAgent()).toBe("human");
  });
});

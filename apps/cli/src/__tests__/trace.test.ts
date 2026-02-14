import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "skillport-trace-test-" + Date.now());
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

import { saveTrace, loadTrace, listTraces, startTrace } from "../utils/trace.js";

beforeEach(() => {
  mkdirSync(join(testHome, ".skillport"), { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true });
  }
});

describe("saveTrace / loadTrace", () => {
  it("saves a trace and loads by trace_id", () => {
    const traceId = saveTrace({
      skill_id: "acme/data-pipeline",
      version: "1.0.0",
      agent: "claude-code",
      started_at: "2026-01-15T10:00:00.000Z",
      completed_at: "2026-01-15T10:00:05.000Z",
      duration_ms: 5000,
      input: { prompt: "run pipeline" },
      result: "success",
      error: null,
      files_modified: ["output.csv"],
      tokens_used: 1500,
    });

    expect(traceId).toMatch(/^[0-9a-f-]{36}$/);

    const loaded = loadTrace(traceId);
    expect(loaded).not.toBeNull();
    expect(loaded!.trace_id).toBe(traceId);
    expect(loaded!.skill_id).toBe("acme/data-pipeline");
    expect(loaded!.version).toBe("1.0.0");
    expect(loaded!.result).toBe("success");
    expect(loaded!.duration_ms).toBe(5000);
    expect(loaded!.tokens_used).toBe(1500);
    expect(loaded!.files_modified).toEqual(["output.csv"]);
  });

  it("loads trace by filename", () => {
    saveTrace({
      skill_id: "acme/test",
      version: "2.0.0",
      agent: "human",
      started_at: "2026-02-01T12:30:00.000Z",
      completed_at: "2026-02-01T12:30:10.000Z",
      duration_ms: 10000,
      input: {},
      result: "failure",
      error: "timeout",
      files_modified: [],
      tokens_used: null,
    });

    // Find the generated filename
    const dir = join(testHome, ".skillport", "traces");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(1);

    const loaded = loadTrace(files[0]);
    expect(loaded).not.toBeNull();
    expect(loaded!.skill_id).toBe("acme/test");
    expect(loaded!.result).toBe("failure");
    expect(loaded!.error).toBe("timeout");
  });

  it("returns null for non-existent trace", () => {
    const loaded = loadTrace("non-existent-id");
    expect(loaded).toBeNull();
  });

  it("returns null for non-existent filename", () => {
    const loaded = loadTrace("missing.json");
    expect(loaded).toBeNull();
  });
});

describe("listTraces", () => {
  it("returns empty array when no traces exist", () => {
    expect(listTraces()).toEqual([]);
  });

  it("lists all traces sorted by started_at (newest first)", () => {
    saveTrace({
      skill_id: "a/b",
      version: "1.0.0",
      agent: "human",
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-01T00:01:00.000Z",
      duration_ms: 60000,
      input: {},
      result: "success",
      error: null,
      files_modified: [],
      tokens_used: null,
    });

    saveTrace({
      skill_id: "c/d",
      version: "2.0.0",
      agent: "claude-code",
      started_at: "2026-02-01T00:00:00.000Z",
      completed_at: "2026-02-01T00:00:30.000Z",
      duration_ms: 30000,
      input: {},
      result: "failure",
      error: "bad output",
      files_modified: [],
      tokens_used: 500,
    });

    const traces = listTraces();
    expect(traces.length).toBe(2);
    // Newest first
    expect(traces[0].skill_id).toBe("c/d");
    expect(traces[1].skill_id).toBe("a/b");
  });

  it("filters by skill_id", () => {
    saveTrace({
      skill_id: "a/b",
      version: "1.0.0",
      agent: "human",
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-01T00:01:00.000Z",
      duration_ms: 60000,
      input: {},
      result: "success",
      error: null,
      files_modified: [],
      tokens_used: null,
    });

    saveTrace({
      skill_id: "x/y",
      version: "1.0.0",
      agent: "human",
      started_at: "2026-02-01T00:00:00.000Z",
      completed_at: "2026-02-01T00:01:00.000Z",
      duration_ms: 60000,
      input: {},
      result: "error",
      error: "crash",
      files_modified: [],
      tokens_used: null,
    });

    const filtered = listTraces("a/b");
    expect(filtered.length).toBe(1);
    expect(filtered[0].skill_id).toBe("a/b");
  });
});

describe("startTrace", () => {
  it("creates a trace with timing and finalization", () => {
    const handle = startTrace("acme/tool", "3.0.0", "agent", { goal: "test" });
    expect(handle.started_at).toBeDefined();

    const traceId = handle.finalize("success", {
      files_modified: ["a.txt"],
      tokens_used: 200,
    });

    expect(traceId).toMatch(/^[0-9a-f-]{36}$/);

    const loaded = loadTrace(traceId);
    expect(loaded).not.toBeNull();
    expect(loaded!.skill_id).toBe("acme/tool");
    expect(loaded!.version).toBe("3.0.0");
    expect(loaded!.agent).toBe("agent");
    expect(loaded!.result).toBe("success");
    expect(loaded!.input).toEqual({ goal: "test" });
    expect(loaded!.files_modified).toEqual(["a.txt"]);
    expect(loaded!.tokens_used).toBe(200);
    expect(loaded!.duration_ms).toBeGreaterThanOrEqual(0);
    expect(loaded!.completed_at).toBeDefined();
  });

  it("records error in finalized trace", () => {
    const handle = startTrace("x/y", "1.0.0", "human", {});
    const traceId = handle.finalize("error", { error: "something broke" });

    const loaded = loadTrace(traceId);
    expect(loaded!.result).toBe("error");
    expect(loaded!.error).toBe("something broke");
  });
});

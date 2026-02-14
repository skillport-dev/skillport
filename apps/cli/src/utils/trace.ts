import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { SP_CONFIG_DIR } from "@skillport/shared";

export interface TraceEntry {
  trace_id: string;
  skill_id: string;
  version: string;
  agent: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  input: Record<string, unknown>;
  plan?: Record<string, unknown>;
  result: "success" | "failure" | "error";
  error: string | null;
  files_modified: string[];
  tokens_used: number | null;
}

function tracesDir(): string {
  return join(homedir(), SP_CONFIG_DIR, "traces");
}

/**
 * Generate a filename from trace metadata.
 * Format: 2026-02-13T200000_author_skill-name_1.2.0.json
 */
function generateTraceFilename(skillId: string, version: string, startedAt: string): string {
  const ts = startedAt.replace(/[:.]/g, "").replace("T", "T").slice(0, 15);
  const slug = skillId.replace(/\//g, "_");
  return `${ts}_${slug}_${version}.json`;
}

/**
 * Save a trace entry to ~/.skillport/traces/.
 * Returns the trace_id.
 */
export function saveTrace(entry: Omit<TraceEntry, "trace_id">): string {
  const dir = tracesDir();
  mkdirSync(dir, { recursive: true });

  const traceId = randomUUID();
  const full: TraceEntry = { trace_id: traceId, ...entry };
  const filename = generateTraceFilename(entry.skill_id, entry.version, entry.started_at);
  writeFileSync(join(dir, filename), JSON.stringify(full, null, 2));

  return traceId;
}

/**
 * Load a trace by trace_id or filename.
 */
export function loadTrace(idOrFilename: string): TraceEntry | null {
  const dir = tracesDir();
  if (!existsSync(dir)) return null;

  // If it ends with .json, treat as filename
  if (idOrFilename.endsWith(".json")) {
    const path = join(dir, idOrFilename);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  // Otherwise, search by trace_id
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf-8");
    const trace = JSON.parse(content) as TraceEntry;
    if (trace.trace_id === idOrFilename) return trace;
  }

  return null;
}

/**
 * List all traces, optionally filtered by skill_id.
 * Returns traces sorted by started_at (newest first).
 */
export function listTraces(skillId?: string): TraceEntry[] {
  const dir = tracesDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const traces: TraceEntry[] = [];

  for (const file of files) {
    try {
      const trace = JSON.parse(readFileSync(join(dir, file), "utf-8")) as TraceEntry;
      if (!skillId || trace.skill_id === skillId) {
        traces.push(trace);
      }
    } catch {
      // Skip invalid trace files
    }
  }

  return traces.sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/**
 * Create a new trace with timestamps.
 * Call startTrace() before execution, then complete with saveTrace().
 */
export function startTrace(
  skillId: string,
  version: string,
  agent: string,
  input: Record<string, unknown>,
): { started_at: string; finalize: (result: "success" | "failure" | "error", opts?: { error?: string; files_modified?: string[]; tokens_used?: number | null }) => string } {
  const started_at = new Date().toISOString();

  return {
    started_at,
    finalize(result, opts = {}) {
      const completed_at = new Date().toISOString();
      const duration_ms = new Date(completed_at).getTime() - new Date(started_at).getTime();

      return saveTrace({
        skill_id: skillId,
        version,
        agent,
        started_at,
        completed_at,
        duration_ms,
        input,
        result,
        error: opts.error ?? null,
        files_modified: opts.files_modified ?? [],
        tokens_used: opts.tokens_used ?? null,
      });
    },
  };
}

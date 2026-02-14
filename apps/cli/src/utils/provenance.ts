import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { SP_CONFIG_DIR } from "@skillport/shared";

export interface ProvenanceEntry {
  ts: string;
  action: string;
  skill_id?: string;
  version?: string;
  agent?: string;
  risk_score?: number;
  install_path?: string;
  files_written?: string[];
  files_removed?: string[];
  source?: "marketplace" | "local-file";
  scan_passed?: boolean;
  author_sig_verified?: boolean;
  platform_sig_present?: boolean;
  policy_allowed?: boolean;
  session_id?: string;
  [key: string]: unknown;
}

// --- Session tracking ---

let _sessionId: string | undefined;
let _sessionInstallCount = 0;

export function getSessionId(): string {
  if (!_sessionId) _sessionId = randomUUID();
  return _sessionId;
}

export function getSessionInstallCount(): number {
  return _sessionInstallCount;
}

export function incrementSessionInstallCount(): void {
  _sessionInstallCount++;
}

/** Reset session state (for testing). */
export function resetSession(): void {
  _sessionId = undefined;
  _sessionInstallCount = 0;
}

function provenancePath(): string {
  return join(homedir(), SP_CONFIG_DIR, "provenance.jsonl");
}

/**
 * Append a provenance entry to ~/.skillport/provenance.jsonl.
 * Automatically adds timestamp and session_id.
 */
export function logProvenance(entry: Omit<ProvenanceEntry, "ts" | "session_id">): void {
  const dir = join(homedir(), SP_CONFIG_DIR);
  mkdirSync(dir, { recursive: true });

  const full: ProvenanceEntry = {
    ...entry,
    ts: new Date().toISOString(),
    session_id: getSessionId(),
  };

  appendFileSync(provenancePath(), JSON.stringify(full) + "\n");
}

/**
 * Detect the calling agent from environment variables.
 */
export function detectAgent(): string {
  if (process.env.CLAUDE_CODE) return "claude-code";
  if (process.env.SKILLPORT_MCP) return "mcp-client";
  if (process.env.SKILLPORT_AGENT) return process.env.SKILLPORT_AGENT;
  if (process.argv.includes("--yes") && process.argv.includes("--json")) return "agent";
  return "human";
}

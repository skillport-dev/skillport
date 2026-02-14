// Exit codes — category-based constants for agent branching decisions
export const EXIT = {
  SUCCESS: 0,
  GENERAL: 1,
  INPUT_INVALID: 2,
  NETWORK: 10,
  AUTH_REQUIRED: 11,
  DEPENDENCY_MISSING: 20,
  SECURITY_REJECTED: 30,
  QUALITY_FAILED: 31,
  POLICY_REJECTED: 32,
} as const;

const SCHEMA_VERSION = 1;

// --json detection (global flag)
export function isJsonMode(): boolean {
  return process.argv.includes("--json");
}

// Structured success result → stdout
export function outputResult(data: Record<string, unknown>): void {
  const envelope = { schema_version: SCHEMA_VERSION, ok: true, data };
  process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
}

// Structured error → stdout (JSON mode) / stderr (normal)
export function outputError(
  code: string,
  message: string,
  opts: {
    exitCode?: number;
    retryable?: boolean;
    hints?: string[];
  } = {},
): void {
  const { exitCode = EXIT.GENERAL, retryable = false, hints = [] } = opts;
  process.exitCode = exitCode;

  if (isJsonMode()) {
    const envelope = {
      schema_version: SCHEMA_VERSION,
      ok: false,
      error: { code, message, retryable, hints },
    };
    process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
  } else {
    console.error(message);
  }
}

// Progress/info/success → stderr (suppressed in JSON mode to keep stdout clean)
export function logProgress(msg: string): void {
  if (!isJsonMode()) process.stderr.write(msg + "\n");
}

export function logInfo(msg: string): void {
  if (!isJsonMode()) process.stderr.write(msg + "\n");
}

export function logSuccess(msg: string): void {
  if (!isJsonMode()) process.stderr.write(msg + "\n");
}

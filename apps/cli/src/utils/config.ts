import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  SP_CONFIG_DIR,
  SP_KEYS_DIR,
  SP_AUDIT_DIR,
  SP_CONFIG_FILE,
  SP_REGISTRY_FILE,
  DEFAULT_MARKETPLACE_URL,
  DEFAULT_MARKETPLACE_WEB_URL,
} from "@skillport/shared";

export interface SkillPortConfig {
  marketplace_url: string;
  marketplace_web_url: string;
  auth_token?: string;
  auth_token_expires_at?: string;
  default_key_id?: string;
}

export interface InstalledSkill {
  id: string;
  version: string;
  installed_at: string;
  install_path: string;
  author_key_id: string;
}

export interface Registry {
  skills: InstalledSkill[];
}

function configDir(): string {
  return join(homedir(), SP_CONFIG_DIR);
}

export function ensureConfigDirs(): void {
  const base = configDir();
  mkdirSync(join(base, SP_KEYS_DIR), { recursive: true });
  mkdirSync(join(base, SP_AUDIT_DIR), { recursive: true });
  mkdirSync(join(base, "installed"), { recursive: true });
}

export function configPath(): string {
  return join(configDir(), SP_CONFIG_FILE);
}

export function keysDir(): string {
  return join(configDir(), SP_KEYS_DIR);
}

export function auditLogPath(): string {
  return join(configDir(), SP_AUDIT_DIR, "audit.log");
}

export function registryPath(): string {
  return join(configDir(), SP_REGISTRY_FILE);
}

export function loadConfig(): SkillPortConfig {
  const path = configPath();
  if (!existsSync(path)) {
    return {
      marketplace_url: DEFAULT_MARKETPLACE_URL,
      marketplace_web_url: DEFAULT_MARKETPLACE_WEB_URL,
    };
  }
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  // Backward compat: derive web URL if missing
  if (!raw.marketplace_web_url) {
    raw.marketplace_web_url = DEFAULT_MARKETPLACE_WEB_URL;
  }
  return raw;
}

export function saveConfig(config: SkillPortConfig): void {
  ensureConfigDirs();
  writeFileSync(configPath(), JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function loadRegistry(): Registry {
  const path = registryPath();
  if (!existsSync(path)) {
    return { skills: [] };
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function saveRegistry(registry: Registry): void {
  ensureConfigDirs();
  writeFileSync(registryPath(), JSON.stringify(registry, null, 2));
}

export function appendAuditLog(entry: Record<string, unknown>): void {
  ensureConfigDirs();
  const logEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  const path = auditLogPath();
  const line = JSON.stringify(logEntry) + "\n";
  appendFileSync(path, line);
}

export function hasKeys(): boolean {
  const dir = keysDir();
  return existsSync(join(dir, "default.key")) && existsSync(join(dir, "default.pub"));
}

export function loadPrivateKey(): string {
  return readFileSync(join(keysDir(), "default.key"), "utf-8");
}

export function loadPublicKey(): string {
  return readFileSync(join(keysDir(), "default.pub"), "utf-8");
}

/**
 * Validate that the API URL uses HTTPS (except for localhost/127.0.0.1).
 * Returns null if valid, or an error message if invalid.
 */
export function validateApiUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !isLocal) {
      return `Insecure API URL: ${url} — HTTPS is required for non-local hosts`;
    }
    return null;
  } catch {
    return `Invalid API URL: ${url}`;
  }
}

/**
 * Check if the stored auth token has expired.
 */
export function isTokenExpired(config: SkillPortConfig): boolean {
  if (!config.auth_token_expires_at) return false;
  return new Date(config.auth_token_expires_at).getTime() < Date.now();
}

/**
 * Validate that the config is ready for authenticated API calls.
 * Returns null if OK, or an error message describing the problem.
 */
export function checkAuthReady(config: SkillPortConfig): string | null {
  if (!config.auth_token) {
    return "Not logged in. Run 'skillport login' first.";
  }
  if (isTokenExpired(config)) {
    return "Auth token has expired. Run 'skillport login' to re-authenticate.";
  }
  return validateApiUrl(config.marketplace_url);
}

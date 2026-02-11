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
  writeFileSync(configPath(), JSON.stringify(config, null, 2));
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

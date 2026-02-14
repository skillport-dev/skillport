export const SP_VERSION = "1.0" as const;
export const SP_FILE_EXTENSION = ".ssp";
export const SP_CONFIG_DIR = ".skillport";
export const SP_KEYS_DIR = "keys";
export const SP_AUDIT_DIR = "audit";
export const SP_AUDIT_FILE = "audit.log";
export const SP_CONFIG_FILE = "config.json";
export const SP_REGISTRY_FILE = "installed/registry.json";

export const OPENCLAW_SKILLS_DIR = ".openclaw/skills";
export const CLAUDE_CODE_SKILLS_DIR = ".claude/skills";

export const SKILL_PLATFORMS = [
  "openclaw",
  "claude-code",
  "universal",
] as const;

export type SkillPlatform = (typeof SKILL_PLATFORMS)[number];

export const DEFAULT_MARKETPLACE_URL = "https://api.skillport.market";
export const DEFAULT_MARKETPLACE_WEB_URL = "https://skillport.market";

export const RATE_LIMITS = {
  unauthenticated: 30,
  authenticated: 120,
  upload: 10,
  download: 60,
  mcp: 60,
} as const;

export const SKILL_CATEGORIES = [
  "automation",
  "data",
  "devtools",
  "communication",
  "productivity",
  "security",
  "ai",
  "other",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const SKILL_STATUS = [
  "draft",
  "pending_review",
  "published",
  "suspended",
  "archived",
] as const;

export type SkillStatus = (typeof SKILL_STATUS)[number];

export const VERSION_STATUS = [
  "pending",
  "scanning",
  "approved",
  "rejected",
] as const;

export type VersionStatus = (typeof VERSION_STATUS)[number];

export const REPORT_REASONS = [
  "malware",
  "impersonation",
  "copyright",
  "fraud",
  "vulnerability",
  "tos_violation",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUS = [
  "open",
  "triaged",
  "resolved",
  "dismissed",
] as const;

export type ReportStatus = (typeof REPORT_STATUS)[number];

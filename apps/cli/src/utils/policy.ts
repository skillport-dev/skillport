import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { SP_CONFIG_DIR } from "@skillport/shared";

// --- Policy Schema ---

const AutoInstallPolicySchema = z.object({
  max_risk_score: z.number().default(30),
  require_platform_sig: z.boolean().default(false),
  max_per_session: z.number().default(5),
});

const PolicySchema = z.object({
  allowed_hosts: z.array(z.string()).default([]),
  workspace_boundary: z.boolean().default(false),
  requires_approval: z.array(z.string()).default([]),
  auto_install: AutoInstallPolicySchema.default({}),
});

const PolicyFileSchema = z.object({
  policy: PolicySchema.default({}),
});

export type Policy = z.infer<typeof PolicySchema>;
export type AutoInstallPolicy = z.infer<typeof AutoInstallPolicySchema>;

// --- Policy Loading ---

const DEFAULT_POLICY: Policy = PolicySchema.parse({});

/**
 * Load policy from .skillportrc (project-local → user-global → defaults).
 * File format: JSON with a top-level `policy` key.
 */
export function loadPolicy(): Policy {
  // 1. Project-local .skillportrc
  const localPath = join(process.cwd(), ".skillportrc");
  if (existsSync(localPath)) {
    try {
      const raw = JSON.parse(readFileSync(localPath, "utf-8"));
      return PolicyFileSchema.parse(raw).policy;
    } catch {
      // Invalid policy file — fall through to global
    }
  }

  // 2. User-global ~/.skillport/.skillportrc
  const globalPath = join(homedir(), SP_CONFIG_DIR, ".skillportrc");
  if (existsSync(globalPath)) {
    try {
      const raw = JSON.parse(readFileSync(globalPath, "utf-8"));
      return PolicyFileSchema.parse(raw).policy;
    } catch {
      // Invalid policy file — use defaults
    }
  }

  // 3. Built-in defaults (permissive)
  return DEFAULT_POLICY;
}

// --- Policy Evaluation ---

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  hints?: string[];
}

/**
 * Check if an action is allowed by the current policy.
 *
 * Actions listed in `requires_approval` are blocked when running
 * in non-interactive mode (--yes or --json).
 *
 * Install actions in non-interactive mode are also checked against
 * `auto_install` limits (risk score, platform sig, session count).
 */
export function checkPolicy(
  action: string,
  context: {
    nonInteractive?: boolean;
    riskScore?: number;
    hasPlatformSig?: boolean;
    sessionInstallCount?: number;
  } = {},
): PolicyCheckResult {
  const policy = loadPolicy();

  // Check requires_approval
  if (policy.requires_approval.includes(action)) {
    if (context.nonInteractive) {
      return {
        allowed: false,
        reason: `Action '${action}' requires approval per policy. Cannot proceed in non-interactive mode.`,
        hints: [
          "Remove --yes or --json to use interactive mode.",
          `Or remove '${action}' from requires_approval in .skillportrc.`,
        ],
      };
    }
  }

  // Check auto_install policy for install actions in non-interactive mode
  if (action === "install" && context.nonInteractive) {
    const auto = policy.auto_install;

    if (context.riskScore !== undefined && context.riskScore > auto.max_risk_score) {
      return {
        allowed: false,
        reason: `Risk score ${context.riskScore} exceeds policy limit of ${auto.max_risk_score}.`,
        hints: [
          "Increase auto_install.max_risk_score in .skillportrc to allow this.",
          "Or install manually without --yes.",
        ],
      };
    }

    if (auto.require_platform_sig && context.hasPlatformSig === false) {
      return {
        allowed: false,
        reason: "Policy requires platform signature, but this package is not platform-signed.",
        hints: [
          "Set auto_install.require_platform_sig to false in .skillportrc.",
        ],
      };
    }

    if (context.sessionInstallCount !== undefined && context.sessionInstallCount >= auto.max_per_session) {
      return {
        allowed: false,
        reason: `Session install limit reached (${auto.max_per_session}).`,
        hints: [
          "Increase auto_install.max_per_session in .skillportrc.",
        ],
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if a host is allowed by policy.
 * If allowed_hosts is empty (default), all hosts are allowed.
 */
export function isHostAllowed(host: string): boolean {
  const policy = loadPolicy();
  if (policy.allowed_hosts.length === 0) return true;
  return policy.allowed_hosts.includes(host);
}

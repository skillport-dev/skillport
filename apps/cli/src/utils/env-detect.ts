/**
 * Environment detection — inspects the user's system to determine
 * compatibility with a skill's requirements and suggest optimizations.
 */

import { execSync } from "node:child_process";
import { platform as osPlatform } from "node:os";
import type { Manifest } from "@skillport/core";

export interface EnvCheckResult {
  check: string;
  status: "ok" | "missing" | "warn";
  detail: string;
  /** If missing, can the section referencing this be skipped? */
  skippable?: boolean;
}

export interface EnvReport {
  os: { name: string; compatible: boolean };
  binaries: EnvCheckResult[];
  envVars: EnvCheckResult[];
  /** Indices of SKILL.md sections that require missing dependencies */
  incompatibleSections: number[];
  /** Overall ready to install */
  ready: boolean;
}

/**
 * Detect the current OS in OpenClaw format.
 */
export function detectOS(): string {
  const p = osPlatform();
  if (p === "darwin") return "macos";
  if (p === "win32") return "windows";
  return p; // "linux" etc.
}

/**
 * Check if a binary exists on PATH.
 */
export function binaryExists(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an environment variable is set.
 */
export function envVarExists(name: string): boolean {
  return !!process.env[name];
}

/**
 * Run full environment check against a manifest's requirements.
 */
export function checkEnvironment(manifest: Manifest): EnvReport {
  const currentOS = detectOS();
  const osCompatible = manifest.os_compat.includes(currentOS as any);

  // Check CLI dependencies
  const binaries: EnvCheckResult[] = manifest.dependencies
    .filter((d) => d.type === "cli" || d.type === "brew" || d.type === "apt")
    .map((dep) => {
      const found = binaryExists(dep.name);
      return {
        check: dep.name,
        status: found ? "ok" as const : dep.optional ? "warn" as const : "missing" as const,
        detail: found
          ? `Found${dep.version ? ` (requires ${dep.version})` : ""}`
          : dep.optional
            ? "Not found (optional)"
            : "Not found (required)",
        skippable: dep.optional ?? false,
      };
    });

  // Check env vars from required_inputs (type=secret or type=string with known env var patterns)
  const envVars: EnvCheckResult[] = manifest.install.required_inputs
    .filter((input) => input.key === input.key.toUpperCase()) // convention: uppercase = env var
    .map((input) => {
      const found = envVarExists(input.key);
      return {
        check: input.key,
        status: found ? "ok" as const : input.required ? "missing" as const : "warn" as const,
        detail: found
          ? "Set"
          : input.required
            ? `Not set — ${input.description}`
            : `Not set (optional) — ${input.description}`,
      };
    });

  const hasMissing =
    binaries.some((b) => b.status === "missing") ||
    envVars.some((e) => e.status === "missing");

  return {
    os: { name: currentOS, compatible: osCompatible },
    binaries,
    envVars,
    incompatibleSections: [], // filled by caller with SKILL.md analysis
    ready: osCompatible && !hasMissing,
  };
}

/**
 * Detect which SKILL.md sections reference missing binaries/deps,
 * so we can suggest skipping them.
 */
export function findIncompatibleSections(
  sectionTexts: string[],
  missingBins: string[],
): number[] {
  if (missingBins.length === 0) return [];

  const incompatible: number[] = [];
  for (let i = 0; i < sectionTexts.length; i++) {
    const lower = sectionTexts[i].toLowerCase();
    for (const bin of missingBins) {
      if (lower.includes(bin.toLowerCase())) {
        incompatible.push(i);
        break;
      }
    }
  }
  return incompatible;
}

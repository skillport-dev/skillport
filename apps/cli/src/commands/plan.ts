import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import chalk from "chalk";
import {
  extractSSP,
  verifyChecksums,
} from "@skillport/core";
import type { Platform } from "@skillport/core";
import {
  scanFiles,
  generateReport,
  isScannable,
} from "@skillport/scanner";
import { OPENCLAW_SKILLS_DIR, CLAUDE_CODE_SKILLS_DIR } from "@skillport/shared";
import {
  loadRegistry,
} from "../utils/config.js";
import {
  checkEnvironment,
} from "../utils/env-detect.js";
import {
  isJsonMode,
  outputResult,
  outputError,
  logProgress,
  logInfo,
  EXIT,
} from "../utils/output.js";

function getSkillsBaseDir(plat: Platform, options: { project?: boolean } = {}): string {
  switch (plat) {
    case "claude-code":
      if (options.project) {
        return join(".claude", "skills");
      }
      return process.env.CLAUDE_SKILLS_DIR || join(homedir(), CLAUDE_CODE_SKILLS_DIR);
    case "openclaw":
    default:
      return process.env.OPENCLAW_SKILLS_DIR || join(homedir(), OPENCLAW_SKILLS_DIR);
  }
}

function detectPlatformTarget(manifestPlatform: Platform): "openclaw" | "claude-code" {
  if (manifestPlatform === "claude-code") return "claude-code";
  if (manifestPlatform === "universal") {
    const hasClaude = existsSync(join(homedir(), ".claude"));
    const hasOpenClaw = existsSync(join(homedir(), ".openclaw"));
    if (hasClaude && !hasOpenClaw) return "claude-code";
  }
  return "openclaw";
}

export interface PlanOptions {
  project?: boolean;
  global?: boolean;
}

export async function planCommand(
  target: string,
  options: PlanOptions,
): Promise<void> {
  // 1. Load SSP — local file or marketplace
  let data: Buffer;

  if (existsSync(target)) {
    data = readFileSync(target);
  } else {
    // Resolve from marketplace
    logInfo(`Resolving from marketplace: ${target}`);

    const { loadConfig, checkAuthReady } = await import("../utils/config.js");
    const config = loadConfig();
    const authError = checkAuthReady(config);
    if (authError) {
      outputError("AUTH_REQUIRED", authError, {
        exitCode: EXIT.AUTH_REQUIRED,
        hints: ["Run 'skillport login' to authenticate."],
      });
      return;
    }

    let skillId = target;
    let version: string | undefined;
    const atIdx = target.lastIndexOf("@");
    if (atIdx > 0) {
      skillId = target.substring(0, atIdx);
      version = target.substring(atIdx + 1);
    }

    try {
      let resolvedId = skillId;
      if (skillId.includes("/")) {
        const searchRes = await fetch(
          `${config.marketplace_url}/v1/skills?q=${encodeURIComponent(skillId)}&per_page=1`,
          { headers: { Authorization: `Bearer ${config.auth_token}` } },
        );
        if (!searchRes.ok) {
          outputError("NETWORK_ERROR", `Marketplace search failed: ${searchRes.statusText}`, {
            exitCode: EXIT.NETWORK,
            retryable: true,
          });
          return;
        }
        const searchData = await searchRes.json() as { data: Array<{ id: string; ssp_id: string }> };
        const match = searchData.data.find((s) => s.ssp_id === skillId);
        if (!match) {
          outputError("NOT_FOUND", `Skill not found: ${skillId}`, {
            exitCode: EXIT.GENERAL,
          });
          return;
        }
        resolvedId = match.id;
      }

      const dlUrl = version
        ? `${config.marketplace_url}/v1/skills/${resolvedId}/download?version=${version}`
        : `${config.marketplace_url}/v1/skills/${resolvedId}/download`;

      const dlRes = await fetch(dlUrl, {
        headers: { Authorization: `Bearer ${config.auth_token}` },
      });
      if (!dlRes.ok) {
        const err = await dlRes.json() as Record<string, unknown>;
        outputError("NETWORK_ERROR", `Download failed: ${(err.error as string) || dlRes.statusText}`, {
          exitCode: EXIT.NETWORK,
          retryable: true,
        });
        return;
      }

      const { url } = await dlRes.json() as { url: string };
      logInfo("Downloading package...");
      const fileRes = await fetch(url);
      if (!fileRes.ok) {
        outputError("NETWORK_ERROR", "Failed to download package file.", {
          exitCode: EXIT.NETWORK,
          retryable: true,
        });
        return;
      }
      data = Buffer.from(await fileRes.arrayBuffer());
    } catch (err) {
      outputError("NETWORK_ERROR", `Marketplace error: ${(err as Error).message}`, {
        exitCode: EXIT.NETWORK,
        retryable: true,
      });
      return;
    }
  }

  // 2. Extract and analyze
  logProgress("Analyzing package...");
  const extracted = await extractSSP(data);
  const { manifest } = extracted;

  // 3. Checksum verification
  const checksumResult = verifyChecksums(extracted.files, extracted.checksums);

  // 4. Signature check
  const authorSigPresent = !!extracted.authorSignature;
  const platformSigPresent = !!extracted.platformSignature;

  // 5. Security scan
  const textFiles = new Map<string, string>();
  for (const [path, content] of extracted.files) {
    if (isScannable(path)) {
      textFiles.set(path, content.toString("utf-8"));
    }
  }
  const scanResult = scanFiles(textFiles);
  const report = generateReport(
    scanResult.issues,
    scanResult.scannedFiles,
    scanResult.skippedFiles,
  );

  // 6. Environment check
  const envReport = checkEnvironment(manifest);

  // 7. Determine install platform + path
  const manifestPlatform = ((manifest as Record<string, unknown>).platform as Platform) || "openclaw";
  const installPlatform = detectPlatformTarget(manifestPlatform);
  const [authorSlug, skillSlug] = manifest.id.split("/");
  const installDir = installPlatform === "claude-code"
    ? join(getSkillsBaseDir("claude-code", { project: options.project }), skillSlug)
    : join(getSkillsBaseDir("openclaw"), authorSlug, skillSlug);

  // 8. Check if already installed
  const registry = loadRegistry();
  const existing = registry.skills.find((s) => s.id === manifest.id);
  let action: "install" | "upgrade" | "reinstall" = "install";
  if (existing) {
    action = existing.version === manifest.version ? "reinstall" : "upgrade";
  }

  // 9. Determine file changes
  const filesAdded: string[] = [];
  const filesUpdated: string[] = [];
  for (const [path] of extracted.files) {
    const cleanPath = path.startsWith("payload/") ? path.substring(8) : path;
    const targetFile = join(installDir, cleanPath);
    if (existsSync(targetFile)) {
      filesUpdated.push(cleanPath);
    } else {
      filesAdded.push(cleanPath);
    }
  }
  // Always include manifest.json and SKILL.md
  if (!filesAdded.includes("manifest.json") && !filesUpdated.includes("manifest.json")) {
    if (existsSync(join(installDir, "manifest.json"))) {
      filesUpdated.push("manifest.json");
    } else {
      filesAdded.push("manifest.json");
    }
  }
  if (extracted.skillMd && !filesAdded.includes("SKILL.md") && !filesUpdated.includes("SKILL.md")) {
    if (existsSync(join(installDir, "SKILL.md"))) {
      filesUpdated.push("SKILL.md");
    } else {
      filesAdded.push("SKILL.md");
    }
  }

  // 10. Permission flags
  const requiresAcceptRisk =
    manifest.permissions.exec.shell ||
    manifest.danger_flags.some((f) => f.severity === "critical");

  // 11. Missing deps
  const missingDeps = envReport.binaries
    .filter((b) => b.status === "missing")
    .map((b) => b.check);
  const optionalMissing = envReport.binaries
    .filter((b) => b.status === "warn")
    .map((b) => b.check);

  // Build plan result
  const planData = {
    action,
    skill_id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    current_version: existing?.version ?? null,
    platform: installPlatform,
    install_path: installDir,
    changes: {
      files_added: filesAdded,
      files_updated: filesUpdated,
      files_removed: [] as string[],
    },
    environment: {
      os_compatible: envReport.os.compatible,
      os: envReport.os.name,
      missing_deps: missingDeps,
      optional_missing: optionalMissing,
    },
    security: {
      checksums_valid: checksumResult.valid,
      author_signature: authorSigPresent,
      platform_signature: platformSigPresent,
      risk_score: report.risk_score,
      scan_passed: report.passed,
      issues_count: report.summary.total,
      requires_accept_risk: requiresAcceptRisk,
    },
    rollback: {
      command: `skillport uninstall ${manifest.id} --yes`,
    },
  };

  if (isJsonMode()) {
    outputResult(planData);
    return;
  }

  // Human-readable output
  console.log(chalk.bold(`\nPlan: ${action} ${manifest.name} v${manifest.version}`));
  if (existing) {
    console.log(chalk.dim(`  Current: v${existing.version} → v${manifest.version}`));
  }
  console.log(chalk.dim(`  Platform: ${installPlatform}`));
  console.log(chalk.dim(`  Path: ${installDir}`));
  console.log();

  // Changes
  console.log(chalk.bold("Changes:"));
  if (filesAdded.length > 0) {
    console.log(chalk.green(`  + ${filesAdded.length} file(s) added`));
  }
  if (filesUpdated.length > 0) {
    console.log(chalk.yellow(`  ~ ${filesUpdated.length} file(s) updated`));
  }
  console.log();

  // Environment
  console.log(chalk.bold("Environment:"));
  const osIcon = envReport.os.compatible ? chalk.green("✓") : chalk.red("✗");
  console.log(`  ${osIcon} OS: ${envReport.os.name}`);
  if (missingDeps.length > 0) {
    console.log(chalk.red(`  ✗ Missing: ${missingDeps.join(", ")}`));
  }
  if (optionalMissing.length > 0) {
    console.log(chalk.yellow(`  ! Optional: ${optionalMissing.join(", ")}`));
  }
  if (missingDeps.length === 0 && optionalMissing.length === 0) {
    console.log(chalk.green("  ✓ All dependencies met"));
  }
  console.log();

  // Security
  console.log(chalk.bold("Security:"));
  console.log(`  ${checksumResult.valid ? chalk.green("✓") : chalk.red("✗")} Checksums`);
  console.log(`  ${authorSigPresent ? chalk.green("✓") : chalk.red("✗")} Author signature`);
  console.log(`  ${platformSigPresent ? chalk.green("✓") : chalk.dim("-")} Platform signature`);
  console.log(`  ${report.passed ? chalk.green("✓") : chalk.red("✗")} Scan (risk: ${report.risk_score}/100, issues: ${report.summary.total})`);
  if (requiresAcceptRisk) {
    console.log(chalk.yellow("  ! Requires --accept-risk"));
  }
  console.log();

  // Rollback
  console.log(chalk.dim(`Rollback: ${planData.rollback.command}`));
  console.log(chalk.dim(`Apply:    skillport install ${target} --yes`));
}

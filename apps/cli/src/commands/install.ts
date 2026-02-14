import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  extractSSP,
  verifyChecksums,
  assessPermissions,
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
  saveRegistry,
  appendAuditLog,
} from "../utils/config.js";
import {
  displayScanReport,
  displayPermissions,
  displayDangerFlags,
} from "../utils/display.js";
import {
  parseSkillMd,
  reconstructSkillMd,
  sectionSummary,
} from "../utils/skill-parser.js";
import {
  checkEnvironment,
  findIncompatibleSections,
  detectOS,
} from "../utils/env-detect.js";
import {
  isJsonMode,
  outputResult,
  outputError,
  logProgress,
  logInfo,
  logSuccess,
  EXIT,
} from "../utils/output.js";
import { updateClaudeMd } from "../utils/claude-md.js";
import { checkPolicy } from "../utils/policy.js";
import { logProvenance, detectAgent, getSessionInstallCount, incrementSessionInstallCount } from "../utils/provenance.js";

function getSkillsBaseDir(platform: Platform, options: { project?: boolean } = {}): string {
  switch (platform) {
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

async function detectInstallPlatform(
  platform: Platform,
  nonInteractive: boolean,
): Promise<"openclaw" | "claude-code"> {
  if (platform !== "universal") return platform === "claude-code" ? "claude-code" : "openclaw";

  const hasOpenClaw = existsSync(join(homedir(), ".openclaw"));
  const hasClaudeCode = existsSync(join(homedir(), ".claude"));

  if (hasOpenClaw && !hasClaudeCode) return "openclaw";
  if (hasClaudeCode && !hasOpenClaw) return "claude-code";

  if (nonInteractive) return "openclaw"; // default

  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "This is a universal skill. Install for which platform?",
      choices: [
        { name: "OpenClaw (~/.openclaw/skills/)", value: "openclaw" },
        { name: "Claude Code (~/.claude/skills/)", value: "claude-code" },
      ],
    },
  ]);
  return choice;
}

export async function installCommand(
  target: string,
  options: { acceptRisk?: boolean; yes?: boolean; project?: boolean; global?: boolean; force?: boolean; noIntegrate?: boolean },
): Promise<void> {
  // --project and --global are mutually exclusive
  if (options.project && options.global) {
    outputError("INPUT_INVALID", "--project and --global are mutually exclusive.", {
      exitCode: EXIT.INPUT_INVALID,
      hints: ["Use --project for project-local install or --global for user-wide install, not both."],
    });
    return;
  }

  // 1. Load SSP — local file or download from marketplace
  let data: Buffer;
  if (existsSync(target)) {
    data = readFileSync(target);
  } else {
    // Try to resolve as marketplace skill ID (e.g. "author/skill@1.0.0" or UUID)
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

    // Parse target — could be "skill-id@version" or just "skill-id"
    let skillId = target;
    let version: string | undefined;
    const atIdx = target.lastIndexOf("@");
    if (atIdx > 0) {
      skillId = target.substring(0, atIdx);
      version = target.substring(atIdx + 1);
    }

    try {
      // Search by ssp_id if it contains "/"
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
            hints: ["Check the skill ID and try again.", "Use 'skillport search' to find available skills."],
          });
          return;
        }
        resolvedId = match.id;
      }

      // Get download URL
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

      // Download the actual file
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
      if (!isJsonMode()) {
        console.log(chalk.green(`  Downloaded ${(data.length / 1024).toFixed(1)} KB`));
      }
    } catch (err) {
      outputError("NETWORK_ERROR", `Marketplace error: ${(err as Error).message}`, {
        exitCode: EXIT.NETWORK,
        retryable: true,
      });
      return;
    }
  }

  logProgress("Extracting SkillPort package...");
  const extracted = await extractSSP(data);
  const { manifest } = extracted;

  // 2. Verify checksums
  logProgress("Verifying checksums...");
  const { valid, mismatches } = verifyChecksums(
    extracted.files,
    extracted.checksums,
  );
  if (!valid) {
    outputError("CHECKSUM_MISMATCH", "Checksum verification FAILED. Aborting install.", {
      exitCode: EXIT.SECURITY_REJECTED,
      hints: mismatches.map((path) => `Mismatch: ${path}`),
    });
    return;
  }
  logSuccess("  Checksums verified.");

  // 3. Verify signatures
  if (extracted.authorSignature) {
    logSuccess("  Author signature present.");
  } else {
    outputError("SIGNATURE_MISSING", "No author signature. Aborting install.", {
      exitCode: EXIT.SECURITY_REJECTED,
      hints: ["The package must be signed by its author before installation."],
    });
    return;
  }

  if (extracted.platformSignature) {
    logSuccess("  Platform signature present.");
  }

  // ─── Skill Overview ───
  if (!isJsonMode()) {
    console.log("");
    console.log(chalk.bold("╔══════════════════════════════════════╗"));
    console.log(chalk.bold(`║  ${manifest.name}`));
    console.log(chalk.bold(`║  v${manifest.version} by ${manifest.author.name}`));
    console.log(chalk.bold("╚══════════════════════════════════════╝"));
    console.log(chalk.dim(`  ${manifest.description}`));
    console.log(chalk.dim(`  OS: ${manifest.os_compat.join(", ")} | ID: ${manifest.id}`));
    console.log("");
  }

  // ─── Environment Check ───
  if (!isJsonMode()) {
    console.log(chalk.bold("Environment Check:"));
    console.log(chalk.dim("─".repeat(50)));
  }

  const envReport = checkEnvironment(manifest);

  if (!isJsonMode()) {
    // OS
    const osIcon = envReport.os.compatible ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${osIcon} OS: ${envReport.os.name} ${envReport.os.compatible ? "" : chalk.red("(not compatible)")}`);

    // Binaries
    for (const bin of envReport.binaries) {
      const icon = bin.status === "ok" ? chalk.green("✓")
        : bin.status === "warn" ? chalk.yellow("!")
        : chalk.red("✗");
      console.log(`  ${icon} ${bin.check}: ${chalk.dim(bin.detail)}`);
    }

    // Env vars
    for (const env of envReport.envVars) {
      const icon = env.status === "ok" ? chalk.green("✓")
        : env.status === "warn" ? chalk.yellow("!")
        : chalk.red("✗");
      console.log(`  ${icon} ${env.check}: ${chalk.dim(env.detail)}`);
    }

    if (envReport.binaries.length === 0 && envReport.envVars.length === 0) {
      console.log(chalk.dim("  No specific dependencies required."));
    }

    console.log(chalk.dim("─".repeat(50)));
  }

  if (!envReport.os.compatible) {
    outputError("OS_INCOMPATIBLE", `This skill is not compatible with your OS (${envReport.os.name}).`, {
      exitCode: EXIT.DEPENDENCY_MISSING,
      hints: [`Supported: ${manifest.os_compat.join(", ")}`],
    });
    return;
  }
  if (!isJsonMode()) {
    console.log("");
  }

  // 4. Local re-scan
  logProgress("Running local security scan...");
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

  if (!isJsonMode()) {
    displayScanReport(report);
  }

  // 5. Policy check (blocks in non-interactive mode if policy denies)
  const nonInteractive = !!(options.yes || isJsonMode());
  const policyResult = checkPolicy("install", {
    nonInteractive,
    riskScore: report.risk_score,
    hasPlatformSig: !!extracted.platformSignature,
    sessionInstallCount: getSessionInstallCount(),
  });
  if (!policyResult.allowed) {
    outputError("POLICY_REJECTED", policyResult.reason!, {
      exitCode: EXIT.POLICY_REJECTED,
      hints: policyResult.hints,
    });
    return;
  }

  // 6. Permission consent
  if (!isJsonMode()) {
    displayPermissions(manifest.permissions);
    displayDangerFlags(manifest.danger_flags);
  }

  const permSummary = assessPermissions(manifest.permissions);

  // Check if --accept-risk is required
  const requiresAcceptRisk =
    manifest.permissions.exec.shell ||
    manifest.danger_flags.some((f) => f.severity === "critical");

  if (requiresAcceptRisk && !options.acceptRisk) {
    outputError("SECURITY_REJECTED", "This skill requires shell access or has critical danger flags.", {
      exitCode: EXIT.SECURITY_REJECTED,
      hints: ["Use --accept-risk to acknowledge and proceed."],
    });
    return;
  }

  // ─── Adaptive Content Selection ───
  // Parse SKILL.md and let user customize what gets installed
  let finalSkillMd: string | undefined;
  let finalFiles = extracted.files;

  if (extracted.skillMd && !options.yes) {
    const parsed = parseSkillMd(extracted.skillMd);

    if (parsed.sections.length > 1) {
      // Find sections that reference missing dependencies
      const missingBins = envReport.binaries
        .filter((b) => b.status === "missing")
        .map((b) => b.check);

      const incompatibleIndices = findIncompatibleSections(
        parsed.sections.map((s) => s.raw),
        missingBins,
      );

      if (!isJsonMode()) {
        console.log(chalk.bold("Skill Sections:"));

        for (let i = 0; i < parsed.sections.length; i++) {
          const section = parsed.sections[i];
          const summary = sectionSummary(section);
          const isIncompat = incompatibleIndices.includes(i);
          const icon = isIncompat ? chalk.yellow("!") : chalk.green("✓");
          const hint = isIncompat
            ? chalk.yellow(" (requires missing dependency)")
            : "";

          console.log(`  ${icon} ${section.heading}${hint}`);
          if (summary) {
            console.log(chalk.dim(`    ${summary}`));
          }
        }
        console.log("");
      }

      // Offer customization if there are incompatible or many sections
      const hasIncompat = incompatibleIndices.length > 0;
      const customizeMessage = hasIncompat
        ? "Some sections require missing dependencies. Customize installation?"
        : "Customize which sections to install?";

      const { customize } = await inquirer.prompt([
        {
          type: "confirm",
          name: "customize",
          message: customizeMessage,
          default: hasIncompat,
        },
      ]);

      if (customize) {
        const sectionChoices = parsed.sections.map((section, idx) => {
          const isIncompat = incompatibleIndices.includes(idx);
          const summary = sectionSummary(section);
          const label = isIncompat
            ? `${section.heading} ${chalk.yellow("(missing deps)")}`
            : summary
              ? `${section.heading} ${chalk.dim(`— ${summary}`)}`
              : section.heading;
          return { name: label, value: idx, checked: !isIncompat };
        });

        const { selectedSections } = await inquirer.prompt([
          {
            type: "checkbox",
            name: "selectedSections",
            message: "Select sections to install:",
            choices: sectionChoices,
            validate: (v: number[]) =>
              v.length > 0 || "At least one section must be selected",
          },
        ]);

        // Reconstruct SKILL.md with selected sections
        finalSkillMd = reconstructSkillMd(parsed, selectedSections);

        // Also filter payload files if sections were excluded
        const excludedIndices = new Set(
          parsed.sections
            .map((_, i) => i)
            .filter((i) => !selectedSections.includes(i)),
        );

        if (excludedIndices.size > 0) {
          const excludedRefs = new Set<string>();
          for (const idx of excludedIndices) {
            for (const ref of parsed.sections[idx].referencedFiles) {
              excludedRefs.add(ref);
            }
          }

          // Only filter payload files referenced exclusively by excluded sections
          if (excludedRefs.size > 0) {
            // Check if any included section also references these files
            const includedRefs = new Set<string>();
            for (const idx of selectedSections) {
              for (const ref of parsed.sections[idx].referencedFiles) {
                includedRefs.add(ref);
              }
            }

            const toRemove = new Set<string>();
            for (const ref of excludedRefs) {
              if (!includedRefs.has(ref)) {
                toRemove.add(ref);
                // Also check payload/ prefixed
                toRemove.add(`payload/${ref}`);
              }
            }

            if (toRemove.size > 0) {
              finalFiles = new Map(
                [...extracted.files].filter(([path]) => !toRemove.has(path)),
              );
            }
          }

          if (!isJsonMode()) {
            const removedCount = parsed.sections.length - selectedSections.length;
            console.log(chalk.cyan(`\nOptimized: ${removedCount} section(s) excluded for your environment.`));
          }
        }
      }
    }
  }

  // Final confirmation
  if (!options.yes) {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Install ${manifest.name} v${manifest.version}?`,
        default: true,
      },
    ]);

    if (!confirm) {
      console.log("Installation cancelled.");
      return;
    }
  }

  // 6. Install — determine platform and directory
  const manifestPlatform = ((manifest as Record<string, unknown>).platform as Platform) || "openclaw";
  const installPlatform = await detectInstallPlatform(manifestPlatform, !!options.yes);

  if (installPlatform === "claude-code") {
    logInfo(`Installing as Claude Code skill${options.project ? " (project-local)" : " (user global)"}`);
  }

  const [authorSlug, skillSlug] = manifest.id.split("/");

  // Claude Code uses skill-slug as dir name (flat), OpenClaw uses author/skill
  const installDir = installPlatform === "claude-code"
    ? join(getSkillsBaseDir("claude-code", { project: options.project }), skillSlug)
    : join(getSkillsBaseDir("openclaw"), authorSlug, skillSlug);

  // Idempotency check — skip if same version already installed
  if (!options.force) {
    const reg = loadRegistry();
    const existing = reg.skills.find((s) => s.id === manifest.id);
    if (existing && existing.version === manifest.version) {
      if (isJsonMode()) {
        outputResult({
          skill_id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          platform: installPlatform,
          install_path: existing.install_path,
          already_installed: true,
        });
      } else {
        console.log(chalk.yellow(`Already installed: ${manifest.name} v${manifest.version}`));
        console.log(chalk.dim(`  Use --force to reinstall.`));
      }
      return;
    }
  }

  mkdirSync(installDir, { recursive: true });

  // Write manifest
  writeFileSync(
    join(installDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  // Write SKILL.md (optimized or original)
  const skillMdToWrite = finalSkillMd ?? extracted.skillMd;
  if (skillMdToWrite) {
    writeFileSync(join(installDir, "SKILL.md"), skillMdToWrite);
  }

  // Write payload files (filtered or all)
  for (const [path, content] of finalFiles) {
    if (path === "SKILL.md") continue; // already written above
    const cleanPath = path.startsWith("payload/") ? path.substring(8) : path;
    const filePath = join(installDir, cleanPath);
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, content);
  }

  // 7. Collect required inputs
  if (manifest.install.required_inputs.length > 0) {
    // Only ask for inputs relevant to installed sections
    const relevantInputs = manifest.install.required_inputs.filter((input) => {
      // If SKILL.md was customized, check if the key is still referenced
      if (finalSkillMd) {
        return finalSkillMd.toLowerCase().includes(input.key.toLowerCase());
      }
      return true;
    });

    if (relevantInputs.length > 0) {
      let inputAnswers: Record<string, string>;

      if (options.yes) {
        // Use defaults or empty strings in non-interactive mode
        inputAnswers = {};
        for (const input of relevantInputs) {
          inputAnswers[input.key] = input.default?.toString() || "";
        }
      } else {
        if (!isJsonMode()) {
          console.log(chalk.bold("\nRequired configuration:"));
        }
        inputAnswers = await inquirer.prompt(
          relevantInputs.map((input) => ({
            type: input.type === "secret" ? "password" : "input",
            name: input.key,
            message: input.description,
            default: input.default?.toString(),
          })),
        );
      }

      // Save inputs as .env in install dir
      const envContent = Object.entries(inputAnswers)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
      writeFileSync(join(installDir, ".env"), envContent, { mode: 0o600 });
    }
  }

  // 8. Update registry
  const registry = loadRegistry();
  registry.skills = registry.skills.filter((s) => s.id !== manifest.id);
  registry.skills.push({
    id: manifest.id,
    version: manifest.version,
    installed_at: new Date().toISOString(),
    install_path: installDir,
    author_key_id: manifest.author.signing_key_id,
  });
  saveRegistry(registry);

  // 9. Audit + provenance log
  appendAuditLog({
    action: "install",
    skill_id: manifest.id,
    version: manifest.version,
    risk_score: report.risk_score,
    install_path: installDir,
    customized: finalSkillMd !== undefined,
  });

  logProvenance({
    action: "install",
    agent: detectAgent(),
    skill_id: manifest.id,
    version: manifest.version,
    risk_score: report.risk_score,
    install_path: installDir,
    source: existsSync(target) ? "local-file" : "marketplace",
    scan_passed: report.risk_score < 100,
    author_sig_verified: !!extracted.authorSignature,
    platform_sig_present: !!extracted.platformSignature,
    policy_allowed: true,
    files_written: [...finalFiles.keys()],
  });
  incrementSessionInstallCount();

  // 9b. CLAUDE.md integration (Claude Code only, unless --no-integrate)
  if (installPlatform === "claude-code" && !options.noIntegrate) {
    try {
      updateClaudeMd(manifest.id, manifest.version, installDir, { project: options.project });
      logInfo("  Updated CLAUDE.md with skill entry.");
    } catch {
      // Non-fatal — don't block install on CLAUDE.md write failure
    }
  }

  // 10. Output
  if (isJsonMode()) {
    outputResult({
      skill_id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      platform: installPlatform,
      install_path: installDir,
      customized: finalSkillMd !== undefined,
      risk_score: report.risk_score,
    });
    return;
  }

  console.log(chalk.green(`\nInstalled: ${manifest.name} v${manifest.version}`));
  console.log(chalk.dim(`  Location: ${installDir}`));
  if (finalSkillMd) {
    console.log(chalk.dim("  Optimized for your environment."));
  }
}

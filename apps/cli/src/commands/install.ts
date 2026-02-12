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
import {
  scanFiles,
  generateReport,
  isScannable,
} from "@skillport/scanner";
import { OPENCLAW_SKILLS_DIR } from "@skillport/shared";
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

function getSkillsBaseDir(): string {
  return process.env.OPENCLAW_SKILLS_DIR || join(homedir(), OPENCLAW_SKILLS_DIR);
}

export async function installCommand(
  target: string,
  options: { acceptRisk?: boolean; yes?: boolean },
): Promise<void> {
  // 1. Load SSP — local file or download from marketplace
  let data: Buffer;
  if (existsSync(target)) {
    data = readFileSync(target);
  } else {
    // Try to resolve as marketplace skill ID (e.g. "author/skill@1.0.0" or UUID)
    console.log(chalk.dim(`Resolving from marketplace: ${target}`));

    const { loadConfig, checkAuthReady } = await import("../utils/config.js");
    const config = loadConfig();
    const authError = checkAuthReady(config);
    if (authError) {
      console.log(chalk.red(authError));
      process.exitCode = 1;
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
          console.log(chalk.red(`Marketplace search failed: ${searchRes.statusText}`));
          process.exitCode = 1;
          return;
        }
        const searchData = await searchRes.json() as { data: Array<{ id: string; ssp_id: string }> };
        const match = searchData.data.find((s) => s.ssp_id === skillId);
        if (!match) {
          console.log(chalk.red(`Skill not found: ${skillId}`));
          process.exitCode = 1;
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
        console.log(chalk.red(`Download failed: ${err.error || dlRes.statusText}`));
        process.exitCode = 1;
        return;
      }

      const { url } = await dlRes.json() as { url: string };

      // Download the actual file
      console.log(chalk.dim("Downloading package..."));
      const fileRes = await fetch(url);
      if (!fileRes.ok) {
        console.log(chalk.red("Failed to download package file."));
        process.exitCode = 1;
        return;
      }
      data = Buffer.from(await fileRes.arrayBuffer());
      console.log(chalk.green(`  Downloaded ${(data.length / 1024).toFixed(1)} KB`));
    } catch (err) {
      console.log(chalk.red(`Marketplace error: ${(err as Error).message}`));
      process.exitCode = 1;
      return;
    }
  }

  console.log("Extracting SkillPort package...");
  const extracted = await extractSSP(data);
  const { manifest } = extracted;

  // 2. Verify checksums
  console.log("Verifying checksums...");
  const { valid, mismatches } = verifyChecksums(
    extracted.files,
    extracted.checksums,
  );
  if (!valid) {
    console.log(chalk.red("Checksum verification FAILED. Aborting install."));
    for (const path of mismatches) {
      console.log(chalk.red(`  Mismatch: ${path}`));
    }
    process.exitCode = 1;
    return;
  }
  console.log(chalk.green("  Checksums verified."));

  // 3. Verify signatures
  if (extracted.authorSignature) {
    console.log(chalk.green("  Author signature present."));
  } else {
    console.log(chalk.red("  No author signature. Aborting install."));
    process.exitCode = 1;
    return;
  }

  if (extracted.platformSignature) {
    console.log(chalk.green("  Platform signature present."));
  }

  // ─── Skill Overview ───
  console.log("");
  console.log(chalk.bold("╔══════════════════════════════════════╗"));
  console.log(chalk.bold(`║  ${manifest.name}`));
  console.log(chalk.bold(`║  v${manifest.version} by ${manifest.author.name}`));
  console.log(chalk.bold("╚══════════════════════════════════════╝"));
  console.log(chalk.dim(`  ${manifest.description}`));
  console.log(chalk.dim(`  OS: ${manifest.os_compat.join(", ")} | ID: ${manifest.id}`));
  console.log("");

  // ─── Environment Check ───
  console.log(chalk.bold("Environment Check:"));
  console.log(chalk.dim("─".repeat(50)));

  const envReport = checkEnvironment(manifest);

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

  if (!envReport.os.compatible) {
    console.log(chalk.red(`\nThis skill is not compatible with your OS (${envReport.os.name}).`));
    console.log(chalk.red(`Supported: ${manifest.os_compat.join(", ")}`));
    process.exitCode = 1;
    return;
  }
  console.log("");

  // 4. Local re-scan
  console.log("Running local security scan...");
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

  displayScanReport(report);

  // 5. Permission consent
  displayPermissions(manifest.permissions);
  displayDangerFlags(manifest.danger_flags);

  const permSummary = assessPermissions(manifest.permissions);

  // Check if --accept-risk is required
  const requiresAcceptRisk =
    manifest.permissions.exec.shell ||
    manifest.danger_flags.some((f) => f.severity === "critical");

  if (requiresAcceptRisk && !options.acceptRisk) {
    console.log(
      chalk.red(
        "This skill requires shell access or has critical danger flags.",
      ),
    );
    console.log(
      chalk.red("Use --accept-risk to acknowledge and proceed."),
    );
    process.exitCode = 1;
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

          const removedCount = parsed.sections.length - selectedSections.length;
          console.log(chalk.cyan(`\nOptimized: ${removedCount} section(s) excluded for your environment.`));
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

  // 6. Install to ~/.openclaw/skills/ (or OPENCLAW_SKILLS_DIR if set)
  const [authorSlug, skillSlug] = manifest.id.split("/");
  const installDir = join(
    getSkillsBaseDir(),
    authorSlug,
    skillSlug,
  );
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
        console.log(chalk.bold("\nRequired configuration:"));
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

  // 9. Audit log
  appendAuditLog({
    action: "install",
    skill_id: manifest.id,
    version: manifest.version,
    risk_score: report.risk_score,
    install_path: installDir,
    customized: finalSkillMd !== undefined,
  });

  console.log(chalk.green(`\nInstalled: ${manifest.name} v${manifest.version}`));
  console.log(chalk.dim(`  Location: ${installDir}`));
  if (finalSkillMd) {
    console.log(chalk.dim("  Optimized for your environment."));
  }
}

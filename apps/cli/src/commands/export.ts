import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, basename } from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";
import { createSSP, computeKeyId, type Manifest } from "@skillport/core";
import { scanFiles, generateReport, isScannable, MAX_FILE_SIZE } from "@skillport/scanner";
import { SP_VERSION } from "@skillport/shared";
import {
  hasKeys,
  loadPrivateKey,
  loadPublicKey,
  loadConfig,
} from "../utils/config.js";
import { displayScanReport } from "../utils/display.js";
import {
  parseSkillMd,
  reconstructSkillMd,
  sectionSummary,
} from "../utils/skill-parser.js";
import {
  runQualityCheck,
  depsToManifest,
  type QualityReport,
} from "../utils/quality-check.js";
import { isJsonMode, outputResult, outputError, logProgress, EXIT } from "../utils/output.js";

function collectAllFiles(
  dir: string,
  basePath: string = dir,
): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    if (entry.isDirectory()) {
      const sub = collectAllFiles(fullPath, basePath);
      for (const [k, v] of sub) files.set(k, v);
    } else if (entry.isFile()) {
      const relPath = relative(basePath, fullPath);
      const stat = statSync(fullPath);
      if (stat.size > MAX_FILE_SIZE) continue;
      files.set(relPath, readFileSync(fullPath));
    }
  }

  return files;
}

/**
 * Interactive content selection — lets users choose which SKILL.md sections
 * and payload files to include in the package.
 *
 * Returns the filtered file map with a reconstructed SKILL.md.
 */
async function selectContent(
  allFiles: Map<string, Buffer>,
): Promise<Map<string, Buffer>> {
  const skillMdContent = allFiles.get("SKILL.md")!.toString("utf-8");
  const parsed = parseSkillMd(skillMdContent);

  // If no ## sections, nothing to select — include everything
  if (parsed.sections.length === 0) {
    return allFiles;
  }

  // Show skill overview
  const payloadFiles = [...allFiles.keys()].filter((f) => f !== "SKILL.md");
  console.log("");
  console.log(chalk.bold("Skill overview:"));
  console.log(chalk.dim(`  SKILL.md sections: ${parsed.sections.length}`));
  console.log(chalk.dim(`  Payload files:     ${payloadFiles.length}`));
  console.log("");

  // Ask whether to customize
  const { customize } = await inquirer.prompt([
    {
      type: "confirm",
      name: "customize",
      message: "Select which sections and files to include?",
      default: false,
    },
  ]);

  if (!customize) {
    return allFiles;
  }

  // Section selection
  console.log("");
  console.log(chalk.bold("SKILL.md sections:"));

  const sectionChoices = parsed.sections.map((section, idx) => {
    const summary = sectionSummary(section);
    const label = summary
      ? `${section.heading} ${chalk.dim(`— ${summary}`)}`
      : section.heading;
    return { name: label, value: idx, checked: true };
  });

  const { selectedSections } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedSections",
      message: "Include these sections:",
      choices: sectionChoices,
      validate: (v: number[]) =>
        v.length > 0 || "At least one section must be selected",
    },
  ]);

  // File selection (if there are payload files)
  let selectedFiles = payloadFiles;
  if (payloadFiles.length > 0) {
    console.log("");

    // Highlight files referenced by excluded sections
    const excludedIndices = new Set(
      parsed.sections
        .map((_, i) => i)
        .filter((i) => !selectedSections.includes(i)),
    );
    const excludedRefs = new Set<string>();
    for (const idx of excludedIndices) {
      for (const ref of parsed.sections[idx].referencedFiles) {
        excludedRefs.add(ref);
      }
    }

    const fileChoices = payloadFiles.map((filePath) => {
      const size = allFiles.get(filePath)!.length;
      const sizeStr = size < 1024
        ? `${size} B`
        : `${(size / 1024).toFixed(1)} KB`;
      const hint = excludedRefs.has(filePath)
        ? chalk.yellow(" (referenced by excluded section)")
        : "";
      return {
        name: `${filePath} ${chalk.dim(`(${sizeStr})`)}${hint}`,
        value: filePath,
        checked: !excludedRefs.has(filePath),
      };
    });

    const { files } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "files",
        message: "Include these files:",
        choices: fileChoices,
      },
    ]);
    selectedFiles = files;
  }

  // Reconstruct SKILL.md with selected sections only
  const newSkillMd = reconstructSkillMd(parsed, selectedSections);

  // Build filtered file map
  const filtered = new Map<string, Buffer>();
  filtered.set("SKILL.md", Buffer.from(newSkillMd, "utf-8"));
  for (const filePath of selectedFiles) {
    filtered.set(filePath, allFiles.get(filePath)!);
  }

  // Summary
  const removedSections = parsed.sections.length - selectedSections.length;
  const removedFiles = payloadFiles.length - selectedFiles.length;
  if (removedSections > 0 || removedFiles > 0) {
    console.log("");
    console.log(
      chalk.cyan(
        `Customized: ${removedSections} section(s) and ${removedFiles} file(s) excluded`,
      ),
    );
  }

  return filtered;
}

function displayQualityReport(report: QualityReport): void {
  console.log("");
  console.log(chalk.bold("Quality Report:"));
  console.log(chalk.dim("─".repeat(50)));

  // Dependencies
  if (report.detectedDeps.length > 0) {
    console.log(chalk.bold("  Detected dependencies:"));
    for (const dep of report.detectedDeps) {
      const icon = dep.available ? chalk.green("✓") : chalk.yellow("!");
      const status = dep.available ? "installed" : "not found";
      console.log(`    ${icon} ${dep.name} ${chalk.dim(`(${status} — from ${dep.source})`)}`);
    }
  } else {
    console.log(chalk.dim("  No CLI dependencies detected."));
  }

  // Broken references
  if (report.brokenRefs.length > 0) {
    console.log("");
    console.log(chalk.bold("  Broken file references:"));
    for (const ref of report.brokenRefs) {
      console.log(`    ${chalk.red("✗")} ${ref.ref} ${chalk.dim(`(in ${ref.source})`)}`);
    }
  }

  // Structural issues
  if (report.issues.length > 0) {
    console.log("");
    for (const issue of report.issues) {
      const icon = issue.severity === "error" ? chalk.red("✗")
        : issue.severity === "warn" ? chalk.yellow("!")
        : chalk.blue("i");
      console.log(`  ${icon} ${issue.message}`);
    }
  }

  // Score
  console.log(chalk.dim("─".repeat(50)));
  const scoreColor = report.score >= 80 ? chalk.green
    : report.score >= 50 ? chalk.yellow
    : chalk.red;
  console.log(`  Quality score: ${scoreColor(`${report.score}/100`)}${report.passed ? "" : chalk.red(" — FAILED")}`);
  console.log("");
}

export interface ExportOptions {
  output?: string;
  yes?: boolean;
  id?: string;
  name?: string;
  description?: string;
  skillVersion?: string;
  author?: string;
  openclawCompat?: string;
  os?: string[];
}

export async function exportCommand(
  path: string,
  options: ExportOptions,
): Promise<void> {
  if (!hasKeys()) {
    outputError("KEY_MISSING", "No keys found. Run 'skillport init' first to generate keys.", {
      exitCode: EXIT.GENERAL,
      hints: ["Run 'skillport init' first"],
    });
    return;
  }

  // Collect files
  logProgress(`Reading skill from: ${path}`);
  const allFiles = collectAllFiles(path);

  // Check for SKILL.md
  if (!allFiles.has("SKILL.md")) {
    outputError("FILE_NOT_FOUND", "SKILL.md not found in the skill directory.", {
      exitCode: EXIT.INPUT_INVALID,
    });
    return;
  }

  // Content selection — skip in non-interactive mode
  const selectedFiles = options.yes ? allFiles : await selectContent(allFiles);

  // ─── Quality Check ───
  logProgress("\nRunning quality check...");
  const skillMdForCheck = selectedFiles.get("SKILL.md")!.toString("utf-8");
  const qualityReport = runQualityCheck(skillMdForCheck, selectedFiles);

  if (!isJsonMode()) {
    displayQualityReport(qualityReport);
  }

  if (!qualityReport.passed) {
    if (options.yes) {
      logProgress(chalk.yellow("Quality issues found. Continuing (--yes)."));
    } else {
      const { continueExport } = await inquirer.prompt([
        {
          type: "confirm",
          name: "continueExport",
          message: chalk.yellow("Quality issues found. Continue with export?"),
          default: false,
        },
      ]);
      if (!continueExport) {
        logProgress("Export cancelled. Fix the issues above and try again.");
        return;
      }
    }
  }

  // Run security scan on selected files (fail-closed)
  logProgress("\nRunning security scan...");
  const textFiles = new Map<string, string>();
  for (const [p, content] of selectedFiles) {
    if (isScannable(p)) {
      textFiles.set(p, content.toString("utf-8"));
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

  if (!report.passed) {
    outputError("SCAN_FAILED", "Export blocked: critical/high severity issues found. Fix them before exporting.", {
      exitCode: EXIT.SECURITY_REJECTED,
    });
    return;
  }

  // Gather manifest info
  const config = loadConfig();
  const publicKey = loadPublicKey();
  const keyId = config.default_key_id || computeKeyId(publicKey);

  let answers: {
    id: string;
    name: string;
    description: string;
    version: string;
    authorName: string;
    openclawCompat: string;
    osCompat: string[];
  };

  if (options.yes) {
    // Non-interactive: require all fields via CLI flags
    const missing: string[] = [];
    if (!options.id) missing.push("--id");
    if (!options.name) missing.push("--name");
    if (!options.description) missing.push("--description");
    if (!options.author) missing.push("--author");
    if (missing.length > 0) {
      outputError("INPUT_INVALID", `Missing required flags for --yes mode: ${missing.join(", ")}`, {
        exitCode: EXIT.INPUT_INVALID,
        hints: missing.map(f => `Provide ${f}`),
      });
      return;
    }
    answers = {
      id: options.id!,
      name: options.name!,
      description: options.description!,
      version: options.skillVersion || "1.0.0",
      authorName: options.author!,
      openclawCompat: options.openclawCompat || ">=1.0.0",
      osCompat: options.os || ["macos", "linux"],
    };
  } else {
    answers = await inquirer.prompt([
      {
        type: "input",
        name: "id",
        message: "Skill ID (author-slug/skill-slug):",
        validate: (v: string) =>
          /^[a-z0-9_-]+\/[a-z0-9_-]+$/.test(v) || "Format: author-slug/skill-slug",
      },
      { type: "input", name: "name", message: "Skill name:" },
      { type: "input", name: "description", message: "Description:" },
      {
        type: "input",
        name: "version",
        message: "Version:",
        default: "1.0.0",
        validate: (v: string) =>
          /^\d+\.\d+\.\d+$/.test(v) || "Must be semver (x.y.z)",
      },
      { type: "input", name: "authorName", message: "Author name:" },
      {
        type: "input",
        name: "openclawCompat",
        message: "OpenClaw compatibility range:",
        default: ">=1.0.0",
      },
      {
        type: "checkbox",
        name: "osCompat",
        message: "Compatible OS:",
        choices: ["macos", "linux", "windows"],
        default: ["macos", "linux"],
      },
    ]);
  }

  // Build entrypoints from SKILL.md
  const entrypoints = [{ name: "main", file: "SKILL.md" }];

  // Build manifest with danger flags from scan
  const dangerFlags = report.issues.map((issue) => ({
    code: issue.id,
    severity: issue.severity,
    message: issue.message,
    file: issue.file,
    line: issue.line,
  }));

  // Auto-populate dependencies from quality check
  const detectedDeps = depsToManifest(qualityReport.detectedDeps);

  const manifest: Manifest = {
    ssp_version: SP_VERSION,
    id: answers.id,
    name: answers.name,
    description: answers.description,
    version: answers.version,
    author: {
      name: answers.authorName,
      signing_key_id: keyId,
    },
    platform: "openclaw",
    openclaw_compat: answers.openclawCompat,
    os_compat: answers.osCompat as ("macos" | "linux" | "windows")[],
    entrypoints,
    permissions: {
      network: { mode: "none" },
      filesystem: { read_paths: [], write_paths: [] },
      exec: { allowed_commands: [], shell: false },
    },
    dependencies: detectedDeps,
    danger_flags: dangerFlags,
    install: { steps: [], required_inputs: [] },
    hashes: {},
    created_at: new Date().toISOString(),
  };

  // Create SkillPort package with selected files only
  logProgress("Creating SkillPort package...");
  const privateKey = loadPrivateKey();
  const sspBuffer = await createSSP({
    manifest,
    files: selectedFiles,
    privateKeyPem: privateKey,
  });

  const outputPath = options.output || `${basename(path)}.ssp`;
  writeFileSync(outputPath, sspBuffer);

  // JSON structured output for agent consumers
  if (isJsonMode()) {
    outputResult({
      output_path: outputPath,
      size_bytes: sspBuffer.length,
      files_count: selectedFiles.size,
      dependencies: detectedDeps.map(d => d.name),
      quality_score: qualityReport.score,
      scan_passed: report.passed,
      risk_score: report.risk_score,
      manifest_id: answers.id,
      version: answers.version,
    });
    return;
  }

  console.log(chalk.green(`\nSkillPort package created: ${outputPath}`));
  console.log(
    chalk.dim(`  Size: ${(sspBuffer.length / 1024).toFixed(1)} KB`),
  );
  console.log(
    chalk.dim(`  Files: ${selectedFiles.size} (including SKILL.md)`),
  );
  if (detectedDeps.length > 0) {
    console.log(
      chalk.dim(`  Dependencies: ${detectedDeps.map((d) => d.name).join(", ")}`),
    );
  }
  console.log(
    chalk.dim(`  Quality: ${qualityReport.score}/100`),
  );
}

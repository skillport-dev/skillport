import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename, dirname, extname, resolve } from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  detectPlatform,
  convertToClaudeCode,
  convertToOpenClaw,
  convertToUniversal,
  extractSSP,
} from "@skillport/core";
import type { ConvertWarning, ConvertResult } from "@skillport/core";
import { isJsonMode, outputResult, outputError, EXIT } from "../utils/output.js";

interface ConvertCommandOptions {
  to: string;
  output?: string;
  preserveMeta?: boolean;
  inferTools?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

/**
 * Load a SKILL.md and auxiliary files from a directory.
 */
function loadSkillDir(dirPath: string): { skillMd: string; files: Map<string, Buffer> } {
  const skillMdPath = join(dirPath, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    throw new Error(`No SKILL.md found in ${dirPath}`);
  }
  const skillMd = readFileSync(skillMdPath, "utf-8");
  const files = new Map<string, Buffer>();

  // Collect auxiliary files
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    if (entry === "SKILL.md") continue;
    const fullPath = join(dirPath, entry);
    if (statSync(fullPath).isFile()) {
      files.set(entry, readFileSync(fullPath));
    }
  }

  return { skillMd, files };
}

/**
 * Load from a single .md file.
 */
function loadMdFile(filePath: string): { skillMd: string; files: Map<string, Buffer> } {
  return {
    skillMd: readFileSync(filePath, "utf-8"),
    files: new Map(),
  };
}

/**
 * Load from an .ssp file.
 */
async function loadSspFile(filePath: string): Promise<{ skillMd: string; files: Map<string, Buffer>; platform: string }> {
  const data = readFileSync(filePath);
  const extracted = await extractSSP(data);
  const platform = (extracted.manifest as Record<string, unknown>).platform as string || "openclaw";
  return {
    skillMd: extracted.skillMd || "",
    files: extracted.files,
    platform,
  };
}

/**
 * Display conversion warnings.
 */
function displayWarnings(warnings: ConvertWarning[]): void {
  for (const w of warnings) {
    const icon = w.type === "dynamic_context" || w.type === "security" ? chalk.yellow("⚠") : chalk.blue("ℹ");
    console.log(`  ${icon} ${w.message}`);
  }
}

/**
 * Write conversion result to output directory.
 */
function writeResult(result: ConvertResult, outputPath: string): void {
  mkdirSync(outputPath, { recursive: true });

  // Write SKILL.md
  writeFileSync(join(outputPath, "SKILL.md"), result.skillMd, "utf-8");

  // Write auxiliary files
  for (const [name, content] of result.files) {
    const filePath = join(outputPath, name);
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, content);
  }
}

export async function convertCommand(
  source: string,
  options: ConvertCommandOptions,
): Promise<void> {
  const { to, output, preserveMeta = true, inferTools = false, dryRun = false, yes = false } = options;

  // Validate --to
  const validTargets = ["openclaw", "claude-code", "universal"];
  if (!validTargets.includes(to)) {
    outputError("INPUT_INVALID", `Invalid target platform: ${to}`, {
      exitCode: EXIT.INPUT_INVALID,
      hints: [`Valid targets: ${validTargets.join(", ")}`],
    });
    return;
  }

  // Load source
  let skillMd: string;
  let files: Map<string, Buffer>;
  let sourcePlatform: string | undefined;

  const resolvedSource = resolve(source);

  try {
    if (!existsSync(resolvedSource)) {
      outputError("FILE_NOT_FOUND", `Source not found: ${source}`, {
        exitCode: EXIT.INPUT_INVALID,
      });
      return;
    }

    const stat = statSync(resolvedSource);

    if (stat.isDirectory()) {
      const loaded = loadSkillDir(resolvedSource);
      skillMd = loaded.skillMd;
      files = loaded.files;
    } else if (extname(resolvedSource) === ".ssp") {
      const loaded = await loadSspFile(resolvedSource);
      skillMd = loaded.skillMd;
      files = loaded.files;
      sourcePlatform = loaded.platform;
    } else if (extname(resolvedSource) === ".md") {
      const loaded = loadMdFile(resolvedSource);
      skillMd = loaded.skillMd;
      files = loaded.files;
    } else {
      outputError("INPUT_INVALID", `Unsupported file type: ${extname(resolvedSource)}`, {
        exitCode: EXIT.INPUT_INVALID,
      });
      return;
    }
  } catch (err) {
    outputError("LOAD_ERROR", `Error loading source: ${(err as Error).message}`, {
      exitCode: EXIT.GENERAL,
    });
    return;
  }

  // Auto-detect source platform
  if (!sourcePlatform) {
    sourcePlatform = detectPlatform(skillMd);
  }

  if (sourcePlatform === "unknown") {
    if (yes || isJsonMode()) {
      sourcePlatform = "openclaw"; // default in non-interactive
      if (!isJsonMode()) {
        console.log(chalk.yellow(`Could not detect platform. Defaulting to OpenClaw.`));
      }
    } else {
      const { platform } = await inquirer.prompt([
        {
          type: "list",
          name: "platform",
          message: "Could not detect the source platform. Please select:",
          choices: [
            { name: "OpenClaw", value: "openclaw" },
            { name: "Claude Code", value: "claude-code" },
          ],
        },
      ]);
      sourcePlatform = platform;
    }
  }

  if (!isJsonMode()) {
    console.log(chalk.dim(`Source platform: ${sourcePlatform}`));
    console.log(chalk.dim(`Target platform: ${to}`));
  }

  // Check for same-platform conversion
  if (sourcePlatform === to) {
    if (isJsonMode()) {
      outputResult({
        source_platform: sourcePlatform,
        target: to,
        output_path: null,
        warnings: [],
        skipped: true,
        reason: "Source is already the target platform",
      });
    } else {
      console.log(chalk.yellow(`Source is already ${to}. No conversion needed.`));
    }
    return;
  }

  // Perform conversion
  let result: ConvertResult;
  const convertOptions = { preserveMeta, inferTools };

  if (to === "claude-code") {
    result = convertToClaudeCode(skillMd, files, convertOptions);
  } else if (to === "openclaw") {
    result = convertToOpenClaw(skillMd, files, convertOptions);
  } else {
    result = convertToUniversal(skillMd, files, convertOptions);
  }

  // Dry-run: preview only
  if (dryRun) {
    if (isJsonMode()) {
      outputResult({
        source_platform: sourcePlatform,
        target: to,
        output_path: null,
        warnings: result.warnings,
        dry_run: true,
        skill_md_preview: result.skillMd,
        files_count: result.files.size,
      });
      return;
    }

    if (result.warnings.length > 0) {
      console.log("");
      console.log(chalk.bold("Conversion notes:"));
      displayWarnings(result.warnings);
      console.log("");
    }

    console.log(chalk.bold("─── Preview (--dry-run) ───"));
    console.log(result.skillMd);
    console.log(chalk.bold("─── End Preview ───"));
    if (result.files.size > 0) {
      console.log(chalk.dim(`\n${result.files.size} auxiliary file(s) would be copied.`));
    }
    return;
  }

  // Determine output path
  const outPath = output || join(dirname(resolvedSource), `${basename(resolvedSource, extname(resolvedSource))}-${to}`);

  writeResult(result, outPath);

  if (isJsonMode()) {
    outputResult({
      source_platform: sourcePlatform,
      target: to,
      output_path: outPath,
      warnings: result.warnings,
    });
    return;
  }

  // Display warnings
  if (result.warnings.length > 0) {
    console.log("");
    console.log(chalk.bold("Conversion notes:"));
    displayWarnings(result.warnings);
    console.log("");
  }

  console.log(chalk.green(`Converted to ${to}:`));
  console.log(chalk.dim(`  Output: ${outPath}/`));
  console.log(chalk.dim(`  Files: SKILL.md + ${result.files.size} auxiliary file(s)`));
}

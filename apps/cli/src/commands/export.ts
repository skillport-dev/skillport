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

export async function exportCommand(
  path: string,
  options: { output?: string },
): Promise<void> {
  if (!hasKeys()) {
    console.log(
      chalk.red("No keys found. Run 'skillport init' first to generate keys."),
    );
    process.exitCode = 1;
    return;
  }

  // Collect files
  console.log(`Reading skill from: ${path}`);
  const allFiles = collectAllFiles(path);

  // Check for SKILL.md
  if (!allFiles.has("SKILL.md")) {
    console.log(chalk.red("SKILL.md not found in the skill directory."));
    process.exitCode = 1;
    return;
  }

  // Interactive content selection
  const selectedFiles = await selectContent(allFiles);

  // Run security scan on selected files (fail-closed)
  console.log("\nRunning security scan...");
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

  displayScanReport(report);

  if (!report.passed) {
    console.log(
      chalk.red(
        "Export blocked: critical/high severity issues found. Fix them before exporting.",
      ),
    );
    process.exitCode = 1;
    return;
  }

  // Gather manifest info interactively
  const config = loadConfig();
  const publicKey = loadPublicKey();
  const keyId = config.default_key_id || computeKeyId(publicKey);

  const answers = await inquirer.prompt([
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
    openclaw_compat: answers.openclawCompat,
    os_compat: answers.osCompat,
    entrypoints,
    permissions: {
      network: { mode: "none" },
      filesystem: { read_paths: [], write_paths: [] },
      exec: { allowed_commands: [], shell: false },
    },
    dependencies: [],
    danger_flags: dangerFlags,
    install: { steps: [], required_inputs: [] },
    hashes: {},
    created_at: new Date().toISOString(),
  };

  // Create SkillPort package with selected files only
  console.log("Creating SkillPort package...");
  const privateKey = loadPrivateKey();
  const sspBuffer = await createSSP({
    manifest,
    files: selectedFiles,
    privateKeyPem: privateKey,
  });

  const outputPath = options.output || `${basename(path)}.ssp`;
  writeFileSync(outputPath, sspBuffer);

  console.log(chalk.green(`\nSkillPort package created: ${outputPath}`));
  console.log(
    chalk.dim(`  Size: ${(sspBuffer.length / 1024).toFixed(1)} KB`),
  );
  console.log(
    chalk.dim(`  Files: ${selectedFiles.size} (including SKILL.md)`),
  );
}

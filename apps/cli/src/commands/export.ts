import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
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

  // Run security scan (fail-closed)
  console.log("Running security scan...");
  const textFiles = new Map<string, string>();
  for (const [p, content] of allFiles) {
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

  // Create SkillPort package
  console.log("Creating SkillPort package...");
  const privateKey = loadPrivateKey();
  const sspBuffer = await createSSP({
    manifest,
    files: allFiles,
    privateKeyPem: privateKey,
  });

  const outputPath = options.output || `${basename(path)}.ssp`;
  writeFileSync(outputPath, sspBuffer);

  console.log(chalk.green(`SkillPort package created: ${outputPath}`));
  console.log(
    chalk.dim(`  Size: ${(sspBuffer.length / 1024).toFixed(1)} KB`),
  );
}

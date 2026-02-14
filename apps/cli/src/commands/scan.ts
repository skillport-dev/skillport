import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import chalk from "chalk";
import { extractSSP } from "@skillport/core";
import {
  scanFiles,
  generateReport,
  isScannable,
  MAX_FILE_SIZE,
} from "@skillport/scanner";
import { displayScanReport } from "../utils/display.js";
import { isJsonMode, outputResult, outputError, EXIT } from "../utils/output.js";

function collectFiles(
  dir: string,
  basePath: string = dir,
): Map<string, string> {
  const files = new Map<string, string>();
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    // Skip hidden files/dirs and node_modules
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    if (entry.isDirectory()) {
      const sub = collectFiles(fullPath, basePath);
      for (const [k, v] of sub) files.set(k, v);
    } else if (entry.isFile()) {
      const relPath = relative(basePath, fullPath);
      const stat = statSync(fullPath);
      if (stat.size > MAX_FILE_SIZE) continue;
      if (!isScannable(relPath)) continue;
      files.set(relPath, readFileSync(fullPath, "utf-8"));
    }
  }

  return files;
}

export async function scanCommand(target: string): Promise<void> {
  let files: Map<string, string>;

  if (target.endsWith(".ssp")) {
    // Scan SSP package
    if (!isJsonMode()) console.log(`Scanning SkillPort package: ${target}`);
    const data = readFileSync(target);
    const ssp = await extractSSP(data);

    files = new Map();
    for (const [path, content] of ssp.files) {
      if (isScannable(path)) {
        files.set(path, content.toString("utf-8"));
      }
    }
    if (ssp.skillMd) {
      files.set("SKILL.md", ssp.skillMd);
    }
  } else {
    // Scan directory
    if (!isJsonMode()) console.log(`Scanning directory: ${target}`);
    files = collectFiles(target);
  }

  const result = scanFiles(files);
  const report = generateReport(
    result.issues,
    result.scannedFiles,
    result.skippedFiles,
  );

  if (isJsonMode()) {
    outputResult({
      passed: report.passed,
      risk_score: report.risk_score,
      summary: report.summary,
      issues: report.issues,
      scanned_files: report.scannedFiles,
      skipped_files: report.skippedFiles,
    });
    if (!report.passed) process.exitCode = EXIT.SECURITY_REJECTED;
    return;
  }

  displayScanReport(report);

  if (!report.passed) {
    process.exitCode = 1;
  } else if (report.summary.total > 0) {
    process.exitCode = 2;
  }
}

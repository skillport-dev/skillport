import { readFileSync } from "node:fs";
import { platform } from "node:os";
import chalk from "chalk";
import { extractSSP, verifyChecksums } from "@skillport/core";
import { scanFiles, generateReport, isScannable } from "@skillport/scanner";
import { isJsonMode, outputResult, EXIT } from "../utils/output.js";

interface DiagnosticResult {
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export async function dryRunCommand(sspPath: string): Promise<void> {
  if (!isJsonMode()) {
    console.log(`Dry-run diagnostics for: ${sspPath}`);
    console.log();
  }

  const data = readFileSync(sspPath);
  const extracted = await extractSSP(data);
  const { manifest } = extracted;

  const diagnostics: DiagnosticResult[] = [];

  // 1. Signature check
  diagnostics.push({
    check: "Author Signature",
    status: extracted.authorSignature ? "pass" : "fail",
    detail: extracted.authorSignature ? "Present" : "Missing",
  });

  diagnostics.push({
    check: "Platform Signature",
    status: extracted.platformSignature ? "pass" : "warn",
    detail: extracted.platformSignature ? "Present" : "Absent (not required)",
  });

  // 2. Checksums
  const { valid, mismatches } = verifyChecksums(
    extracted.files,
    extracted.checksums,
  );
  diagnostics.push({
    check: "Checksums",
    status: valid ? "pass" : "fail",
    detail: valid
      ? `All ${Object.keys(extracted.checksums).length} files verified`
      : `${mismatches.length} mismatches`,
  });

  // 3. OS compatibility
  const currentOS = platform() === "darwin" ? "macos" : platform();
  const osCompat = manifest.os_compat.includes(currentOS as any);
  diagnostics.push({
    check: "OS Compatibility",
    status: osCompat ? "pass" : "fail",
    detail: osCompat
      ? `Current OS (${currentOS}) is supported`
      : `Current OS (${currentOS}) not in ${manifest.os_compat.join(", ")}`,
  });

  // 4. Dependencies
  for (const dep of manifest.dependencies) {
    if (dep.type === "cli") {
      const { execSync } = await import("node:child_process");
      let found = false;
      try {
        execSync(`which ${dep.name}`, { stdio: "pipe" });
        found = true;
      } catch {
        found = false;
      }
      diagnostics.push({
        check: `Dependency: ${dep.name}`,
        status: found ? "pass" : dep.optional ? "warn" : "fail",
        detail: found
          ? "Found"
          : dep.optional
            ? "Not found (optional)"
            : "Not found (required)",
      });
    }
  }

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
  diagnostics.push({
    check: "Security Scan",
    status: report.passed ? (report.summary.total > 0 ? "warn" : "pass") : "fail",
    detail: `Risk: ${report.risk_score}/100, Issues: ${report.summary.total}`,
  });

  const hasFail = diagnostics.some((d) => d.status === "fail");

  if (isJsonMode()) {
    if (hasFail) process.exitCode = EXIT.SECURITY_REJECTED;
    outputResult({
      diagnostics,
      passed: !hasFail,
      manifest_id: manifest.id,
      version: manifest.version,
    });
    return;
  }

  // Display diagnostics table
  console.log(chalk.bold("Diagnostic Results:"));
  console.log(chalk.dim("─".repeat(60)));

  for (const d of diagnostics) {
    let icon: string;
    let color: typeof chalk;
    switch (d.status) {
      case "pass":
        icon = "✓";
        color = chalk.green;
        break;
      case "warn":
        icon = "!";
        color = chalk.yellow;
        break;
      case "fail":
        icon = "✗";
        color = chalk.red;
        break;
    }
    console.log(
      `  ${color(icon)} ${d.check.padEnd(25)} ${chalk.dim(d.detail)}`,
    );
  }

  console.log(chalk.dim("─".repeat(60)));

  if (hasFail) {
    console.log(chalk.red.bold("\nDry-run: ISSUES FOUND"));
    process.exitCode = 1;
  } else {
    console.log(chalk.green.bold("\nDry-run: ALL CHECKS PASSED"));
  }
}

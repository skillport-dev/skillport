import chalk from "chalk";
import type { ScanReport } from "@skillport/scanner";
import type { Permissions, DangerFlag } from "@skillport/core";
import {
  assessPermissions,
  formatPermissions,
  riskColor,
  severityColor,
} from "@skillport/core";

export function displayScanReport(report: ScanReport): void {
  console.log();

  if (report.passed) {
    console.log(chalk.green.bold("SCAN PASSED"));
  } else {
    console.log(chalk.red.bold("SCAN FAILED"));
  }

  console.log(
    chalk.dim(`Risk Score: ${report.risk_score}/100 | `) +
      chalk.dim(`Scanned: ${report.scanned_files.length} files | `) +
      chalk.dim(`Issues: ${report.summary.total}`),
  );
  console.log();

  if (report.summary.total > 0) {
    console.log(chalk.bold("Issues by severity:"));
    for (const [severity, count] of Object.entries(report.summary.by_severity)) {
      if (count > 0) {
        const color = severityColor(severity as DangerFlag["severity"]);
        console.log(`  ${(chalk as any)[color](`${severity}: ${count}`)}`);
      }
    }
    console.log();

    console.log(chalk.bold("Details:"));
    for (const issue of report.issues) {
      const color = severityColor(issue.severity);
      const prefix = (chalk as any)[color](`[${issue.severity.toUpperCase()}]`);
      console.log(`  ${prefix} ${issue.message}`);
      console.log(
        chalk.dim(`    ${issue.file}:${issue.line} (${issue.id})`),
      );
      if (issue.remediation) {
        console.log(chalk.dim(`    Fix: ${issue.remediation}`));
      }
    }
  }

  console.log();
}

export function displayPermissions(permissions: Permissions): void {
  const summary = assessPermissions(permissions);
  const lines = formatPermissions(permissions, summary);

  console.log(chalk.bold("Permissions:"));
  for (const line of lines) {
    const color = riskColor(line.risk);
    console.log(
      `  ${line.icon} ${(chalk as any)[color](line.label)}: ${line.detail}`,
    );
  }
  console.log();
}

export function displayDangerFlags(flags: DangerFlag[]): void {
  if (flags.length === 0) return;

  console.log(chalk.bold("Danger Flags:"));
  for (const flag of flags) {
    const color = severityColor(flag.severity);
    const prefix = (chalk as any)[color](`[${flag.severity.toUpperCase()}]`);
    console.log(`  ${prefix} ${flag.message} (${flag.code})`);
    if (flag.file) {
      console.log(chalk.dim(`    ${flag.file}${flag.line ? `:${flag.line}` : ""}`));
    }
  }
  console.log();
}

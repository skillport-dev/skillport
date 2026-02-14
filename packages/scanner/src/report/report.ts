import type { ScanIssue, IssueSeverity, IssueCategory } from "../detectors/types.js";

export interface ScanReport {
  passed: boolean;
  risk_score: number;
  summary: {
    total: number;
    by_severity: Record<IssueSeverity, number>;
    by_category: Record<IssueCategory, number>;
  };
  issues: ScanIssue[];
  scanned_files: string[];
  skipped_files: string[];
  scanned_at: string;
  scanner_version: string;
}

const SEVERITY_WEIGHTS: Record<IssueSeverity, number> = {
  info: 0,
  low: 2,
  medium: 5,
  high: 15,
  critical: 30,
};

export const SCANNER_VERSION = "0.1.0";

export function generateReport(
  issues: ScanIssue[],
  scannedFiles: string[],
  skippedFiles: string[],
): ScanReport {
  const by_severity: Record<IssueSeverity, number> = {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  const by_category: Record<IssueCategory, number> = {
    secret: 0,
    dangerous: 0,
    pii: 0,
    obfuscation: 0,
    network: 0,
  };

  let rawScore = 0;

  for (const issue of issues) {
    by_severity[issue.severity]++;
    by_category[issue.category]++;
    rawScore += SEVERITY_WEIGHTS[issue.severity];
  }

  const risk_score = Math.min(rawScore, 100);
  const passed = by_severity.high === 0 && by_severity.critical === 0;

  return {
    passed,
    risk_score,
    summary: {
      total: issues.length,
      by_severity,
      by_category,
    },
    issues,
    scanned_files: scannedFiles,
    skipped_files: skippedFiles,
    scanned_at: new Date().toISOString(),
    scanner_version: SCANNER_VERSION,
  };
}

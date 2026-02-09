import type { Detector, ScanIssue } from "../detectors/types.js";
import { secretsDetector } from "../detectors/secrets.js";
import { dangerousDetector } from "../detectors/dangerous.js";
import { piiDetector } from "../detectors/pii.js";
import { obfuscationDetector } from "../detectors/obfuscation.js";
import { networkDetector } from "../detectors/network.js";

export const SCANNABLE_EXTENSIONS = new Set([
  ".md",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".sh",
  ".bash",
  ".zsh",
  ".json",
  ".yaml",
  ".yml",
  ".txt",
  ".toml",
  ".cfg",
  ".ini",
  ".env",
  ".conf",
]);

export const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
export const MAX_ZIP_SIZE = 10 * 1024 * 1024; // 10 MB

export function isScannable(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return false;
  const ext = fileName.substring(dotIndex).toLowerCase();
  return SCANNABLE_EXTENSIONS.has(ext);
}

const allDetectors: Detector[] = [
  secretsDetector,
  dangerousDetector,
  piiDetector,
  obfuscationDetector,
  networkDetector,
];

export function scanFileContent(
  content: string,
  fileName: string,
): ScanIssue[] {
  const issues: ScanIssue[] = [];
  const lines = content.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1;

    for (const detector of allDetectors) {
      for (const pattern of detector.patterns) {
        const match = line.match(pattern.regex);
        if (!match) continue;

        // Apply optional filter
        if (pattern.filter && !pattern.filter(match, line)) continue;

        const snippet =
          line.length > 200 ? line.substring(0, 200) + "..." : line;

        issues.push({
          id: pattern.id,
          severity: pattern.severity,
          category: pattern.category,
          message: pattern.message,
          file: fileName,
          line: lineNumber,
          snippet: snippet.trim(),
          remediation: pattern.remediation,
        });
      }
    }
  }

  return issues;
}

export interface ScanFilesResult {
  issues: ScanIssue[];
  scannedFiles: string[];
  skippedFiles: string[];
}

export function scanFiles(
  files: Map<string, string>,
): ScanFilesResult {
  const issues: ScanIssue[] = [];
  const scannedFiles: string[] = [];
  const skippedFiles: string[] = [];

  for (const [path, content] of files) {
    if (!isScannable(path)) {
      skippedFiles.push(path);
      continue;
    }

    const fileIssues = scanFileContent(content, path);
    issues.push(...fileIssues);
    scannedFiles.push(path);
  }

  return { issues, scannedFiles, skippedFiles };
}

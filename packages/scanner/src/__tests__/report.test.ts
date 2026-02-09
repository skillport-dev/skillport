import { describe, it, expect } from "vitest";
import { generateReport } from "../report/report.js";
import type { ScanIssue } from "../detectors/types.js";

describe("Report Generation", () => {
  it("generates passing report with no issues", () => {
    const report = generateReport([], ["test.ts"], []);
    expect(report.passed).toBe(true);
    expect(report.risk_score).toBe(0);
    expect(report.summary.total).toBe(0);
  });

  it("generates failing report with high severity", () => {
    const issues: ScanIssue[] = [
      {
        id: "SEC001",
        severity: "high",
        category: "secret",
        message: "Test",
        file: "test.ts",
        line: 1,
      },
    ];
    const report = generateReport(issues, ["test.ts"], []);
    expect(report.passed).toBe(false);
    expect(report.risk_score).toBe(15);
    expect(report.summary.by_severity.high).toBe(1);
  });

  it("generates failing report with critical severity", () => {
    const issues: ScanIssue[] = [
      {
        id: "DNG005",
        severity: "critical",
        category: "dangerous",
        message: "Test",
        file: "test.sh",
        line: 1,
      },
    ];
    const report = generateReport(issues, ["test.sh"], []);
    expect(report.passed).toBe(false);
    expect(report.risk_score).toBe(30);
  });

  it("passes with only low/medium/info issues", () => {
    const issues: ScanIssue[] = [
      {
        id: "PII002",
        severity: "low",
        category: "pii",
        message: "Email",
        file: "test.md",
        line: 1,
      },
      {
        id: "OBF001",
        severity: "medium",
        category: "obfuscation",
        message: "Base64",
        file: "test.ts",
        line: 5,
      },
    ];
    const report = generateReport(issues, ["test.md", "test.ts"], []);
    expect(report.passed).toBe(true);
    expect(report.risk_score).toBe(7); // 2 + 5
  });

  it("caps risk score at 100", () => {
    const issues: ScanIssue[] = Array.from({ length: 10 }, (_, i) => ({
      id: `SEC00${i}`,
      severity: "critical" as const,
      category: "secret" as const,
      message: "Test",
      file: "test.ts",
      line: i,
    }));
    const report = generateReport(issues, ["test.ts"], []);
    expect(report.risk_score).toBe(100);
  });

  it("includes scanner version and timestamp", () => {
    const report = generateReport([], [], []);
    expect(report.scanner_version).toBeTruthy();
    expect(report.scanned_at).toBeTruthy();
  });
});

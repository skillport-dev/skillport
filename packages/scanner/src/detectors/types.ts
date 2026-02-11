import type { Severity } from "@skillport/core";

export type IssueSeverity = Severity;
export type IssueCategory =
  | "secret"
  | "dangerous"
  | "pii"
  | "obfuscation"
  | "network";

export interface ScanIssue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  file: string;
  line: number;
  snippet?: string;
  remediation?: string;
}

export interface DetectorPattern {
  id: string;
  regex: RegExp;
  category: IssueCategory;
  severity: IssueSeverity;
  message: string;
  remediation?: string;
  filter?: (match: RegExpMatchArray, line: string) => boolean;
}

export interface Detector {
  name: string;
  patterns: DetectorPattern[];
}

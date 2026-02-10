/**
 * Export quality checks — validates skill content quality before packaging.
 *
 * Runs on the author's machine to:
 * 1. Auto-detect CLI tool dependencies from SKILL.md and scripts
 * 2. Verify those dependencies exist on the author's system
 * 3. Check for broken file references in SKILL.md
 * 4. Assess SKILL.md structural quality
 */

import type { Dependency } from "@skillport/core";
import { binaryExists } from "./env-detect.js";

export interface DetectedDep {
  name: string;
  /** Where it was found (e.g. "SKILL.md ## Git Summary", "scripts/deploy.sh") */
  source: string;
  /** Whether the binary exists on the author's machine */
  available: boolean;
}

export interface BrokenRef {
  /** The referenced file path */
  ref: string;
  /** Where the reference was found */
  source: string;
}

export interface QualityIssue {
  severity: "error" | "warn" | "info";
  message: string;
}

export interface QualityReport {
  /** CLI tools detected from content */
  detectedDeps: DetectedDep[];
  /** File references in SKILL.md that don't exist in the payload */
  brokenRefs: BrokenRef[];
  /** Structural quality issues */
  issues: QualityIssue[];
  /** 0-100 quality score */
  score: number;
  /** Whether quality is sufficient for export */
  passed: boolean;
}

/**
 * Common CLI tools that might appear in skill content.
 * We look for these as commands (not substrings of words).
 */
const KNOWN_CLI_TOOLS = new Set([
  "git", "docker", "docker-compose", "npm", "npx", "yarn", "pnpm",
  "node", "python", "python3", "pip", "pip3",
  "ruby", "gem", "cargo", "rustc", "go",
  "curl", "wget", "jq", "yq", "sed", "awk", "grep",
  "kubectl", "helm", "terraform", "ansible",
  "aws", "gcloud", "az",
  "redis-cli", "psql", "mysql", "sqlite3", "mongosh",
  "ffmpeg", "imagemagick", "convert",
  "gh", "hub", "slack", "slack_cli",
  "make", "cmake", "gcc", "g++", "clang",
  "java", "javac", "mvn", "gradle",
  "swift", "xcodebuild",
  "deno", "bun",
]);

/**
 * Detect CLI tool references in text content.
 * Looks for tool names in backtick commands, shebang lines, and common patterns.
 */
export function detectCliDeps(
  content: string,
  source: string,
): DetectedDep[] {
  const found = new Map<string, DetectedDep>();

  // 1. Backtick command blocks: `git commit`, `docker build`, etc.
  const backtickPattern = /`([a-zA-Z0-9_-]+)(?:\s[^`]*)?`/g;
  let match;
  while ((match = backtickPattern.exec(content)) !== null) {
    const tool = match[1].toLowerCase();
    if (KNOWN_CLI_TOOLS.has(tool) && !found.has(tool)) {
      found.set(tool, {
        name: tool,
        source,
        available: binaryExists(tool),
      });
    }
  }

  // 2. Shebang lines: #!/usr/bin/env python3, #!/usr/bin/python3
  const shebangPattern = /^#!\/usr\/bin\/env\s+([a-zA-Z0-9_-]+)|^#!\/(?:usr\/(?:local\/)?)?bin\/([a-zA-Z0-9_-]+)/gm;
  while ((match = shebangPattern.exec(content)) !== null) {
    const tool = (match[1] || match[2]).toLowerCase();
    if (!found.has(tool)) {
      found.set(tool, {
        name: tool,
        source,
        available: binaryExists(tool),
      });
    }
  }

  // 3. Shell command patterns: lines starting with tool name (in code blocks or scripts)
  const cmdPattern = /^(?:\$\s+|>\s+)?([a-zA-Z0-9_-]+)\s/gm;
  while ((match = cmdPattern.exec(content)) !== null) {
    const tool = match[1].toLowerCase();
    if (KNOWN_CLI_TOOLS.has(tool) && !found.has(tool)) {
      found.set(tool, {
        name: tool,
        source,
        available: binaryExists(tool),
      });
    }
  }

  return [...found.values()];
}

/**
 * Check file references in SKILL.md against the actual payload files.
 */
export function checkFileReferences(
  skillMdContent: string,
  payloadFiles: string[],
  sectionHeadings?: string[],
): BrokenRef[] {
  const broken: BrokenRef[] = [];
  const fileSet = new Set(payloadFiles);

  // Extract file references from SKILL.md
  const backtickPattern = /`([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)`/g;
  let match;
  while ((match = backtickPattern.exec(skillMdContent)) !== null) {
    const ref = match[1];
    if (ref.startsWith("http") || ref.includes("@")) continue;
    if (!ref.includes("/")) continue; // skip simple filenames without path

    // Check if the file exists in payload (try both with and without payload/ prefix)
    const exists = fileSet.has(ref) || fileSet.has(`payload/${ref}`);
    if (!exists) {
      // Find which section it's in for better reporting
      const before = skillMdContent.slice(0, match.index);
      const lastHeading = before.match(/## ([^\n]+)/g);
      const source = lastHeading
        ? `SKILL.md ## ${lastHeading[lastHeading.length - 1].replace("## ", "")}`
        : "SKILL.md";

      broken.push({ ref, source });
    }
  }

  // Also check path patterns without backticks
  const pathPattern = /(?:scripts|payload|bins)\/[a-zA-Z0-9_.-]+/g;
  while ((match = pathPattern.exec(skillMdContent)) !== null) {
    const ref = match[0];
    const exists = fileSet.has(ref) || fileSet.has(`payload/${ref}`);
    if (!exists && !broken.some((b) => b.ref === ref)) {
      const before = skillMdContent.slice(0, match.index);
      const lastHeading = before.match(/## ([^\n]+)/g);
      const source = lastHeading
        ? `SKILL.md ## ${lastHeading[lastHeading.length - 1].replace("## ", "")}`
        : "SKILL.md";

      broken.push({ ref, source });
    }
  }

  return broken;
}

/**
 * Check SKILL.md structural quality.
 */
export function checkStructure(
  skillMdContent: string,
  fileCount: number,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const lines = skillMdContent.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);

  // Must have a # title
  if (!lines.some((l) => /^# /.test(l))) {
    issues.push({ severity: "error", message: "SKILL.md is missing a # title heading" });
  }

  // Should have at least some content
  if (nonEmptyLines.length < 5) {
    issues.push({ severity: "warn", message: "SKILL.md is very short — add more detailed instructions" });
  }

  // Should have ## sections for non-trivial skills
  const sectionCount = lines.filter((l) => /^## /.test(l)).length;
  if (sectionCount === 0 && nonEmptyLines.length > 20) {
    issues.push({ severity: "warn", message: "Consider splitting SKILL.md into ## sections for better organization" });
  }

  // Check for description/intro text after the title
  const titleIdx = lines.findIndex((l) => /^# /.test(l));
  if (titleIdx >= 0) {
    const afterTitle = lines.slice(titleIdx + 1, titleIdx + 5);
    const hasIntro = afterTitle.some((l) => l.trim().length > 0 && !/^#/.test(l));
    if (!hasIntro) {
      issues.push({ severity: "warn", message: "Add a brief description after the # title" });
    }
  }

  // Check for frontmatter
  if (!skillMdContent.startsWith("---")) {
    issues.push({ severity: "info", message: "No YAML frontmatter — consider adding name and description metadata" });
  }

  // Payload file check
  if (fileCount <= 1) {
    issues.push({ severity: "info", message: "Package contains only SKILL.md — consider adding supporting scripts or configs" });
  }

  return issues;
}

/**
 * Convert detected dependencies to manifest Dependency format.
 */
export function depsToManifest(deps: DetectedDep[]): Dependency[] {
  return deps.map((d) => ({
    name: d.name,
    type: "cli" as const,
    optional: false,
  }));
}

/**
 * Run full quality check on skill content before export.
 */
export function runQualityCheck(
  skillMdContent: string,
  allFiles: Map<string, Buffer>,
): QualityReport {
  const payloadFiles = [...allFiles.keys()].filter((f) => f !== "SKILL.md");

  // 1. Detect CLI dependencies from SKILL.md
  const depsFromSkillMd = detectCliDeps(skillMdContent, "SKILL.md");

  // 2. Detect CLI dependencies from script files
  const depsFromScripts: DetectedDep[] = [];
  for (const [path, content] of allFiles) {
    if (path === "SKILL.md") continue;
    const ext = path.split(".").pop()?.toLowerCase();
    if (["sh", "bash", "zsh", "py", "rb", "js", "ts"].includes(ext ?? "")) {
      const scriptDeps = detectCliDeps(content.toString("utf-8"), path);
      for (const dep of scriptDeps) {
        if (!depsFromSkillMd.some((d) => d.name === dep.name) &&
            !depsFromScripts.some((d) => d.name === dep.name)) {
          depsFromScripts.push(dep);
        }
      }
    }
  }

  const allDeps = [...depsFromSkillMd, ...depsFromScripts];

  // 3. Check file references
  const brokenRefs = checkFileReferences(skillMdContent, payloadFiles);

  // 4. Check structure
  const structureIssues = checkStructure(skillMdContent, allFiles.size);

  // 5. Add dep-related issues
  const issues = [...structureIssues];

  const unavailableDeps = allDeps.filter((d) => !d.available);
  if (unavailableDeps.length > 0) {
    issues.push({
      severity: "warn",
      message: `${unavailableDeps.length} detected tool(s) not found on your system: ${unavailableDeps.map((d) => d.name).join(", ")}`,
    });
  }

  if (brokenRefs.length > 0) {
    issues.push({
      severity: "error",
      message: `${brokenRefs.length} file reference(s) in SKILL.md point to missing files`,
    });
  }

  // 6. Calculate score
  let score = 100;

  // Deductions
  for (const issue of issues) {
    if (issue.severity === "error") score -= 20;
    else if (issue.severity === "warn") score -= 10;
    else score -= 2;
  }

  // Bonus for good practices
  const lines = skillMdContent.split("\n");
  const sectionCount = lines.filter((l) => /^## /.test(l)).length;
  if (sectionCount >= 2) score = Math.min(100, score + 5);
  if (skillMdContent.startsWith("---")) score = Math.min(100, score + 5);

  score = Math.max(0, score);

  return {
    detectedDeps: allDeps,
    brokenRefs,
    issues,
    score,
    passed: !issues.some((i) => i.severity === "error"),
  };
}

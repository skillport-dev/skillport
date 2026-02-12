/**
 * OpenClaw → Claude Code conversion.
 */

import type { ConvertOptions, ConvertResult, ConvertWarning } from "./index.js";
import { embedPlatformMeta } from "./metadata-comments.js";

/** Known tool inference patterns */
const TOOL_PATTERNS: Array<{ pattern: RegExp; tool: string }> = [
  { pattern: /\bgit\s+(diff|log|status|add|commit|push|pull|clone|branch|checkout|merge|rebase)/i, tool: "Bash" },
  { pattern: /\bnpm\s+(install|run|test|build)/i, tool: "Bash" },
  { pattern: /\bpnpm\s+/i, tool: "Bash" },
  { pattern: /\bcurl\s+/i, tool: "Bash" },
  { pattern: /\bgrep\b/i, tool: "Grep" },
  { pattern: /\bread\b.*\bfile/i, tool: "Read" },
  { pattern: /\bsearch\b.*\bfile/i, tool: "Glob" },
  { pattern: /\bfind\b.*\bfile/i, tool: "Glob" },
  { pattern: /\bwrite\b.*\bfile/i, tool: "Write" },
  { pattern: /\bedit\b.*\b(file|code)/i, tool: "Edit" },
  { pattern: /\bweb\s*(search|fetch|browse)/i, tool: "WebSearch" },
  { pattern: /\bfetch\b.*\burl/i, tool: "WebFetch" },
];

/**
 * Convert name to kebab-case for Claude Code.
 */
function toKebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/**
 * Parse YAML frontmatter from SKILL.md.
 */
function parseFrontmatter(skillMd: string): { frontmatter: string; body: string; raw: string } {
  if (!skillMd.startsWith("---")) return { frontmatter: "", body: skillMd, raw: "" };
  const endIdx = skillMd.indexOf("---", 3);
  if (endIdx === -1) return { frontmatter: "", body: skillMd, raw: "" };
  const raw = skillMd.slice(3, endIdx).trim();
  const body = skillMd.slice(endIdx + 3).trimStart();
  return { frontmatter: raw, body, raw };
}

/**
 * Extract simple key-value from YAML frontmatter.
 */
function extractFmValue(fm: string, key: string): string | undefined {
  const regex = new RegExp(`^${key}\\s*:\\s*(.+)$`, "m");
  const match = fm.match(regex);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

/**
 * Extract openclaw metadata from frontmatter.
 */
function extractOpenClawMeta(fm: string): { requires?: string; install?: string[] } {
  const result: { requires?: string; install?: string[] } = {};

  const requiresMatch = fm.match(/openclaw:\s*\n\s+requires:\s*"?([^"\n]+)"?/m);
  if (requiresMatch) result.requires = requiresMatch[1].trim();

  const installMatch = fm.match(/openclaw:\s*[\s\S]*?install:\s*\n((?:\s+-\s+.+\n?)+)/m);
  if (installMatch) {
    result.install = installMatch[1]
      .split("\n")
      .map((l) => l.trim().replace(/^-\s+/, ""))
      .filter(Boolean);
  }

  return result;
}

/**
 * Infer allowed-tools from skill body content.
 */
function inferTools(body: string): string[] {
  const tools = new Set<string>();
  for (const { pattern, tool } of TOOL_PATTERNS) {
    if (pattern.test(body)) {
      tools.add(tool);
    }
  }
  return [...tools];
}

/**
 * Convert OpenClaw SKILL.md to Claude Code SKILL.md.
 */
export function convertToClaudeCode(
  skillMd: string,
  files: Map<string, Buffer>,
  options: ConvertOptions = {},
): ConvertResult {
  const { preserveMeta = true, inferTools: shouldInferTools = false } = options;
  const warnings: ConvertWarning[] = [];

  const { frontmatter: fm, body } = parseFrontmatter(skillMd);

  // Extract existing values
  const name = extractFmValue(fm, "name") || "unnamed-skill";
  const description = extractFmValue(fm, "description") || "";
  const ocMeta = extractOpenClawMeta(fm);

  // Convert name to kebab-case
  const ccName = toKebabCase(name);
  const nameChanged = ccName !== name;

  // Build Claude Code frontmatter
  const ccFmLines: string[] = [
    "---",
    `name: ${ccName}`,
  ];
  if (description) ccFmLines.push(`description: ${description}`);
  ccFmLines.push("user-invocable: true");

  // Infer tools if requested
  if (shouldInferTools) {
    const tools = inferTools(body);
    if (tools.length > 0) {
      ccFmLines.push(`allowed-tools: ${tools.join(", ")}`);
    }
  }

  ccFmLines.push("---");

  // Build metadata comment for preserved OpenClaw data
  let metaBlock = "";
  if (preserveMeta) {
    const meta: Record<string, unknown> = {};
    if (nameChanged) meta.original_name = name;
    if (ocMeta.requires) meta.openclaw_requires = ocMeta.requires;
    if (ocMeta.install && ocMeta.install.length > 0) {
      meta.openclaw_install = ocMeta.install;
      warnings.push({
        type: "install",
        message: "Install steps preserved as metadata comment.",
      });
    }

    if (Object.keys(meta).length > 0) {
      const tempMd = "---\ntemp: true\n---\n";
      metaBlock = embedPlatformMeta(tempMd, meta).replace("---\ntemp: true\n---\n", "").trim();
    }
  }

  // Assemble output
  let output = ccFmLines.join("\n") + "\n";
  if (metaBlock) output += "\n" + metaBlock + "\n";
  output += "\n" + body.trim() + "\n";

  return {
    skillMd: output,
    files: new Map(files),
    warnings,
    platform: "claude-code",
  };
}

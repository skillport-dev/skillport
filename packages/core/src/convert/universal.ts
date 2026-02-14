/**
 * Universal skill generation — creates a skill that works on both platforms.
 */

import type { ConvertOptions, ConvertResult, ConvertWarning } from "./index.js";
import { detectPlatform, detectDynamicContexts } from "./detect.js";
import { embedPlatformMeta } from "./metadata-comments.js";

/**
 * Parse YAML frontmatter.
 */
function parseFrontmatter(skillMd: string): { fm: string; body: string } {
  if (!skillMd.startsWith("---")) return { fm: "", body: skillMd };
  const endIdx = skillMd.indexOf("---", 3);
  if (endIdx === -1) return { fm: "", body: skillMd };
  return {
    fm: skillMd.slice(3, endIdx).trim(),
    body: skillMd.slice(endIdx + 3).trimStart(),
  };
}

function extractFmValue(fm: string, key: string): string | undefined {
  const regex = new RegExp(`^${key}\\s*:\\s*(.+)$`, "m");
  const match = fm.match(regex);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

function extractFmList(fm: string, key: string): string[] {
  const val = extractFmValue(fm, key);
  if (!val) return [];
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Convert a skill to universal format.
 * Preserves the original body and adds metadata for both platforms.
 */
export function convertToUniversal(
  skillMd: string,
  files: Map<string, Buffer>,
  options: ConvertOptions = {},
): ConvertResult {
  const warnings: ConvertWarning[] = [];
  const sourcePlatform = detectPlatform(skillMd);
  const { fm, body } = parseFrontmatter(skillMd);

  const name = extractFmValue(fm, "name") || "unnamed-skill";
  const description = extractFmValue(fm, "description") || "";

  // Gather metadata from both platforms
  const meta: Record<string, unknown> = { source_platform: sourcePlatform };

  if (sourcePlatform === "claude-code") {
    // Preserve CC metadata
    const allowedTools = extractFmList(fm, "allowed-tools");
    if (allowedTools.length > 0) meta.allowed_tools = allowedTools;
    const context = extractFmValue(fm, "context");
    if (context) meta.context = context;
    const agent = extractFmValue(fm, "agent");
    if (agent) meta.agent = agent;
    const argumentHint = extractFmValue(fm, "argument-hint");
    if (argumentHint) meta.argument_hint = argumentHint;

    const dynCtx = detectDynamicContexts(body);
    if (dynCtx.length > 0) {
      meta.has_dynamic_context = true;
      meta.dynamic_commands = dynCtx;
      warnings.push({
        type: "dynamic_context",
        message: "Dynamic context detected. OpenClaw users will need manual input.",
      });
    }
  } else if (sourcePlatform === "openclaw") {
    // Preserve OC metadata
    const requiresMatch = fm.match(/openclaw:\s*\n\s+requires:\s*"?([^"\n]+)"?/m);
    if (requiresMatch) meta.openclaw_requires = requiresMatch[1].trim();

    const installMatch = fm.match(/openclaw:\s*[\s\S]*?install:\s*\n((?:\s+-\s+.+\n?)+)/m);
    if (installMatch) {
      meta.openclaw_install = installMatch[1]
        .split("\n")
        .map((l) => l.trim().replace(/^-\s+/, ""))
        .filter(Boolean);
    }
  }

  // Build a neutral frontmatter (valid for both platforms to read)
  const fmLines = [
    "---",
    `name: ${name}`,
  ];
  if (description) fmLines.push(`description: ${description}`);
  fmLines.push("---");

  let output = fmLines.join("\n") + "\n";
  output = embedPlatformMeta(output, meta);
  output += "\n" + body.trim() + "\n";
  output = output.replace(/\n{3,}/g, "\n\n").trim() + "\n";

  return {
    skillMd: output,
    files: new Map(files),
    warnings,
    platform: "universal",
  };
}

/**
 * Claude Code → OpenClaw conversion.
 */

import type { ConvertOptions, ConvertResult, ConvertWarning } from "./index.js";
import { embedPlatformMeta, embedDynamicContextComment } from "./metadata-comments.js";
import { detectDynamicContexts, detectArgumentPlaceholders } from "./detect.js";

/**
 * Parse YAML frontmatter from SKILL.md.
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

/**
 * Extract simple key-value from YAML frontmatter.
 */
function extractFmValue(fm: string, key: string): string | undefined {
  const regex = new RegExp(`^${key}\\s*:\\s*(.+)$`, "m");
  const match = fm.match(regex);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

/**
 * Extract list from frontmatter (comma-separated on a single line).
 */
function extractFmList(fm: string, key: string): string[] {
  const val = extractFmValue(fm, key);
  if (!val) return [];
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Extract boolean from frontmatter.
 */
function extractFmBool(fm: string, key: string): boolean | undefined {
  const val = extractFmValue(fm, key);
  if (val === "true") return true;
  if (val === "false") return false;
  return undefined;
}

/**
 * Convert $ARGUMENTS, $0, $1 placeholders to OpenClaw format.
 */
function convertPlaceholders(body: string): string {
  return body
    .replace(/\$ARGUMENTS\[(\d+)\]/g, "{ARG_$1}")
    .replace(/\$ARGUMENTS/g, "{ARGUMENTS}")
    .replace(/\$(\d+)/g, "{ARG_$1}");
}

/**
 * Remove dynamic context lines (!`command`) from body and return cleaned body.
 */
function removeDynamicContextLines(body: string): string {
  return body.replace(/^.*!\`[^`]+\`.*$/gm, "").replace(/\n{3,}/g, "\n\n");
}

/**
 * Convert Claude Code SKILL.md to OpenClaw SKILL.md.
 */
export function convertToOpenClaw(
  skillMd: string,
  files: Map<string, Buffer>,
  options: ConvertOptions = {},
): ConvertResult {
  const { preserveMeta = true } = options;
  const warnings: ConvertWarning[] = [];

  const { fm, body } = parseFrontmatter(skillMd);

  // Extract CC values
  const name = extractFmValue(fm, "name") || "unnamed-skill";
  const description = extractFmValue(fm, "description") || "";
  const argumentHint = extractFmValue(fm, "argument-hint");
  const allowedTools = extractFmList(fm, "allowed-tools");
  const context = extractFmValue(fm, "context");
  const agent = extractFmValue(fm, "agent");
  const model = extractFmValue(fm, "model");
  const userInvocable = extractFmBool(fm, "user-invocable");

  // Detect dynamic contexts and argument placeholders
  const dynamicContexts = detectDynamicContexts(body);
  const argPlaceholders = detectArgumentPlaceholders(body);

  // Build OpenClaw frontmatter
  const ocFmLines: string[] = [
    "---",
    `name: ${name}`,
  ];
  if (description) ocFmLines.push(`description: ${description}`);
  ocFmLines.push("metadata:");
  ocFmLines.push("  openclaw: {}");
  ocFmLines.push("---");

  // Build metadata comment for preserved CC data
  const meta: Record<string, unknown> = {};
  if (preserveMeta) {
    if (allowedTools.length > 0) {
      meta.allowed_tools = allowedTools;
      warnings.push({ type: "tools", message: "allowed-tools preserved as metadata comment." });
    }
    if (context) meta.context = context;
    if (agent) meta.agent = agent;
    if (model) meta.model = model;
    if (argumentHint) meta.argument_hint = argumentHint;
    if (userInvocable !== undefined) meta.user_invocable = userInvocable;
  }

  // Process body
  let processedBody = body;

  // Convert argument placeholders
  if (argPlaceholders.length > 0) {
    processedBody = convertPlaceholders(processedBody);
    warnings.push({
      type: "arguments",
      message: `$ARGUMENTS converted to {ARGUMENTS} placeholder.`,
    });
  }

  // Handle dynamic contexts
  if (dynamicContexts.length > 0) {
    processedBody = removeDynamicContextLines(processedBody);
    warnings.push({
      type: "dynamic_context",
      message: `Warning: Dynamic context (!\`cmd\`) cannot be converted. See comments in output.`,
    });
  }

  // Build arguments section if argument-hint exists
  let argsSection = "";
  if (argumentHint) {
    argsSection =
      "\n## Arguments\n\n" +
      `This skill accepts arguments: \`{ARGUMENTS}\`\n` +
      `Hint: ${argumentHint}\n`;
  }

  // Build manual context section for dynamic contexts
  let manualContextSection = "";
  if (dynamicContexts.length > 0) {
    const manualItems = dynamicContexts
      .map((cmd) => `> - Output of: \`${cmd.replace(/\$ARGUMENTS/g, "{ARGUMENTS}").replace(/\$(\d+)/g, "{ARG_$1}")}\``)
      .join("\n");
    manualContextSection =
      "\n## Context (Manual Input Required)\n\n" +
      "> This skill originally used dynamic context injection.\n" +
      "> Please provide the following information:\n" +
      manualItems +
      "\n";
  }

  // Assemble output
  let output = ocFmLines.join("\n") + "\n";

  // Embed platform meta
  if (Object.keys(meta).length > 0) {
    output = embedPlatformMeta(output, meta);
  }

  // Embed dynamic context comment
  if (dynamicContexts.length > 0) {
    output = embedDynamicContextComment(output, dynamicContexts);
  }

  output += argsSection;
  output += manualContextSection;
  output += "\n" + processedBody.trim() + "\n";

  // Clean up excessive newlines
  output = output.replace(/\n{3,}/g, "\n\n").trim() + "\n";

  return {
    skillMd: output,
    files: new Map(files),
    warnings,
    platform: "openclaw",
  };
}

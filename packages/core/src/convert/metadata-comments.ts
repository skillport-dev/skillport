/**
 * Metadata comments — embed/extract platform-specific metadata as HTML comments
 * for lossless round-trip conversion between OpenClaw and Claude Code.
 *
 * Format:
 * <!-- skillport:platform_meta
 * skillport_meta_version: 1
 * generated_by: "skillport@1.0.0"
 * ...fields...
 * -->
 */

export interface PlatformMeta {
  skillport_meta_version?: number;
  generated_by?: string;
  [key: string]: unknown;
}

export interface ExtractResult {
  meta: PlatformMeta | null;
  warnings: string[];
}

export interface DynamicContextMeta {
  commands: string[];
}

const META_COMMENT_REGEX = /<!--\s*skillport:platform_meta\s*\n([\s\S]*?)-->/g;
const DYNAMIC_COMMENT_REGEX = /<!--\s*skillport:dynamic_context\s*\n([\s\S]*?)-->/g;

const SP_VERSION = "1.0.1";

/**
 * Parse a simple YAML-like format from metadata comment.
 * Supports: string, number, boolean, arrays (YAML inline or multiline).
 * NOT a full YAML parser — intentionally simple.
 */
function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n");
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Array item
    if (trimmed.startsWith("- ") && currentKey) {
      if (!currentArray) currentArray = [];
      currentArray.push(trimmed.slice(2).trim().replace(/^"(.*)"$/, "$1"));
      continue;
    }

    // Save previous array
    if (currentKey && currentArray) {
      result[currentKey] = currentArray;
      currentArray = null;
      currentKey = null;
    }

    // Key-value
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let value: unknown = kvMatch[2].trim();

      // JSON array
      if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string
        }
      }
      // Quoted string
      else if (typeof value === "string" && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      // Number
      else if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) {
        value = Number(value);
      }
      // Boolean
      else if (value === "true") value = true;
      else if (value === "false") value = false;
      // Empty value — start of array or object
      else if (value === "") {
        currentKey = key;
        currentArray = [];
        continue;
      }

      result[key] = value;
      currentKey = key;
    }
  }

  // Save trailing array
  if (currentKey && currentArray) {
    result[currentKey] = currentArray;
  }

  return result;
}

/**
 * Serialize metadata to the simple YAML-like format.
 */
function serializeSimpleYaml(data: Record<string, unknown>, indent = ""): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      // Use JSON inline for simple string arrays
      if (value.every((v) => typeof v === "string")) {
        lines.push(`${indent}${key}: ${JSON.stringify(value)}`);
      } else {
        lines.push(`${indent}${key}:`);
        for (const item of value) {
          lines.push(`${indent}  - ${typeof item === "string" ? item : JSON.stringify(item)}`);
        }
      }
    } else if (typeof value === "object") {
      lines.push(`${indent}${key}:`);
      lines.push(serializeSimpleYaml(value as Record<string, unknown>, indent + "  "));
    } else if (typeof value === "string") {
      lines.push(`${indent}${key}: "${value}"`);
    } else {
      lines.push(`${indent}${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

/**
 * Extract platform metadata from SKILL.md content.
 * Enforces single-occurrence rule: first wins, duplicates warned.
 */
export function extractPlatformMeta(skillMd: string): ExtractResult {
  const warnings: string[] = [];
  const matches: RegExpExecArray[] = [];

  let match: RegExpExecArray | null;
  META_COMMENT_REGEX.lastIndex = 0;
  while ((match = META_COMMENT_REGEX.exec(skillMd)) !== null) {
    matches.push(match);
  }

  if (matches.length === 0) {
    return { meta: null, warnings };
  }

  if (matches.length > 1) {
    warnings.push("Multiple skillport:platform_meta comments found. Only the first is used.");
  }

  const yamlContent = matches[0][1];

  let meta: PlatformMeta;
  try {
    meta = parseSimpleYaml(yamlContent) as PlatformMeta;
  } catch {
    warnings.push("Failed to parse metadata comment. Comment will be ignored.");
    return { meta: null, warnings };
  }

  // Validate meta version
  if (meta.skillport_meta_version === undefined) {
    warnings.push("skillport_meta_version missing. Treating as legacy (version 0).");
    meta.skillport_meta_version = 0;
  } else if (typeof meta.skillport_meta_version === "number" && meta.skillport_meta_version > 1) {
    warnings.push(
      `This SKILL.md was generated by a newer SkillPort (meta version ${meta.skillport_meta_version}). Some fields may be ignored.`,
    );
  }

  return { meta, warnings };
}

/**
 * Extract dynamic context metadata from SKILL.md content.
 */
export function extractDynamicContextMeta(skillMd: string): DynamicContextMeta | null {
  DYNAMIC_COMMENT_REGEX.lastIndex = 0;
  const match = DYNAMIC_COMMENT_REGEX.exec(skillMd);
  if (!match) return null;

  const content = match[1];
  const commands: string[] = [];
  for (const line of content.split("\n")) {
    const cmdMatch = line.trim().match(/^-\s*!\`([^`]+)\`$/);
    if (cmdMatch) {
      commands.push(cmdMatch[1]);
    }
  }

  return commands.length > 0 ? { commands } : null;
}

/**
 * Embed platform metadata as an HTML comment.
 */
export function embedPlatformMeta(
  skillMd: string,
  meta: Record<string, unknown>,
): string {
  const fullMeta: Record<string, unknown> = {
    skillport_meta_version: 1,
    generated_by: `skillport@${SP_VERSION}`,
    ...meta,
  };

  const yamlStr = serializeSimpleYaml(fullMeta);
  const comment = `<!-- skillport:platform_meta\n${yamlStr}\n-->`;

  // Remove any existing meta comment first
  let cleaned = skillMd.replace(META_COMMENT_REGEX, "").replace(/\n{3,}/g, "\n\n");

  // Insert after frontmatter (after second ---)
  if (cleaned.startsWith("---")) {
    const endIdx = cleaned.indexOf("---", 3);
    if (endIdx !== -1) {
      const afterFm = endIdx + 3;
      cleaned = cleaned.slice(0, afterFm) + "\n\n" + comment + cleaned.slice(afterFm);
      return cleaned;
    }
  }

  // No frontmatter — prepend
  return comment + "\n\n" + cleaned;
}

/**
 * Embed dynamic context warning comment.
 */
export function embedDynamicContextComment(
  skillMd: string,
  commands: string[],
): string {
  if (commands.length === 0) return skillMd;

  // Remove existing dynamic context comment
  let cleaned = skillMd.replace(DYNAMIC_COMMENT_REGEX, "").replace(/\n{3,}/g, "\n\n");

  const cmdList = commands.map((c) => `- !\`${c}\``).join("\n");
  const comment =
    `<!-- skillport:dynamic_context\n` +
    `WARNING: Dynamic context commands cannot be executed in OpenClaw.\n` +
    `Original commands:\n` +
    `${cmdList}\n` +
    `-->`;

  // Insert after platform_meta comment if present, otherwise after frontmatter
  const metaEnd = cleaned.indexOf("-->\n", cleaned.indexOf("skillport:platform_meta"));
  if (metaEnd !== -1) {
    const insertPos = metaEnd + 3;
    cleaned = cleaned.slice(0, insertPos) + "\n\n" + comment + cleaned.slice(insertPos);
  } else if (cleaned.startsWith("---")) {
    const endIdx = cleaned.indexOf("---", 3);
    if (endIdx !== -1) {
      const afterFm = endIdx + 3;
      cleaned = cleaned.slice(0, afterFm) + "\n\n" + comment + cleaned.slice(afterFm);
    }
  } else {
    cleaned = comment + "\n\n" + cleaned;
  }

  return cleaned;
}

/**
 * Strip all skillport metadata comments from SKILL.md.
 */
export function stripMetadataComments(skillMd: string): string {
  return skillMd
    .replace(META_COMMENT_REGEX, "")
    .replace(DYNAMIC_COMMENT_REGEX, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

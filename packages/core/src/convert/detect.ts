/**
 * Platform auto-detection for SKILL.md files.
 */

export type DetectedPlatform = "openclaw" | "claude-code" | "unknown";

/** Claude Code specific frontmatter keys */
const CC_KEYS = new Set([
  "argument-hint",
  "allowed-tools",
  "user-invocable",
  "disable-model-invocation",
  "context",
  "agent",
  "model",
  "hooks",
]);

/** OpenClaw specific frontmatter keys */
const OC_KEYS = new Set(["metadata"]);

/**
 * Parse YAML frontmatter into a simple key map.
 * Not a full parser — only checks top-level keys.
 */
function parseFrontmatterKeys(frontmatter: string): Set<string> {
  const keys = new Set<string>();
  for (const line of frontmatter.split("\n")) {
    const match = line.match(/^([a-zA-Z_-]+)\s*:/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

/**
 * Check if frontmatter has metadata.openclaw section.
 */
function hasOpenClawMetadata(frontmatter: string): boolean {
  return /metadata:\s*\n\s+openclaw:/m.test(frontmatter);
}

/**
 * Detect platform from SKILL.md content.
 * Returns "openclaw", "claude-code", or "unknown".
 */
export function detectPlatform(skillMd: string): DetectedPlatform {
  // Extract frontmatter
  if (!skillMd.startsWith("---")) return "unknown";

  const endIdx = skillMd.indexOf("---", 3);
  if (endIdx === -1) return "unknown";

  const frontmatter = skillMd.slice(3, endIdx).trim();
  const keys = parseFrontmatterKeys(frontmatter);

  // Check for Claude Code specific keys
  const hasCCKeys = [...CC_KEYS].some((k) => keys.has(k));

  // Check for OpenClaw specific keys
  const hasOCKeys = [...OC_KEYS].some((k) => keys.has(k)) && hasOpenClawMetadata(frontmatter);

  if (hasCCKeys && !hasOCKeys) return "claude-code";
  if (hasOCKeys && !hasCCKeys) return "openclaw";
  if (hasCCKeys && hasOCKeys) return "unknown"; // ambiguous

  return "unknown";
}

/**
 * Detect dynamic context commands (!`command`) in SKILL.md body.
 */
export function detectDynamicContexts(skillMd: string): string[] {
  const commands: string[] = [];
  const regex = /!\`([^`]+)\`/g;
  let match;
  while ((match = regex.exec(skillMd)) !== null) {
    commands.push(match[1]);
  }
  return commands;
}

/**
 * Detect $ARGUMENTS, $0, $1, etc. placeholders.
 */
export function detectArgumentPlaceholders(skillMd: string): string[] {
  const placeholders: string[] = [];
  const regex = /\$(?:ARGUMENTS(?:\[\d+\])?|\d+)/g;
  let match;
  while ((match = regex.exec(skillMd)) !== null) {
    if (!placeholders.includes(match[0])) {
      placeholders.push(match[0]);
    }
  }
  return placeholders;
}

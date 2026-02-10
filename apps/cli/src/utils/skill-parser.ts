/**
 * SKILL.md parser — splits a skill document into selectable sections.
 *
 * Structure:
 *   - frontmatter (YAML between ---) — always preserved
 *   - header (# Title + text before first ##) — always preserved
 *   - sections (## Heading + body) — user-selectable
 */

export interface SkillSection {
  /** The ## heading text (without ##) */
  heading: string;
  /** The full raw content including the heading line */
  raw: string;
  /** Files referenced in this section (detected by backtick paths) */
  referencedFiles: string[];
}

export interface ParsedSkill {
  /** YAML frontmatter (empty string if none) */
  frontmatter: string;
  /** Everything before the first ## section (# title, intro paragraph) */
  header: string;
  /** Individual ## sections */
  sections: SkillSection[];
}

/**
 * Parse SKILL.md content into structured parts.
 */
export function parseSkillMd(content: string): ParsedSkill {
  let frontmatter = "";
  let body = content;

  // Extract YAML frontmatter
  if (body.startsWith("---")) {
    const endIdx = body.indexOf("---", 3);
    if (endIdx !== -1) {
      frontmatter = body.slice(0, endIdx + 3);
      body = body.slice(endIdx + 3);
    }
  }

  // Split into lines and find ## boundaries
  const lines = body.split("\n");
  let headerLines: string[] = [];
  const sections: SkillSection[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (/^## /.test(line)) {
      // Save previous section
      if (inSection) {
        sections.push(buildSection(currentHeading, currentLines));
      }
      currentHeading = line.replace(/^## /, "").trim();
      currentLines = [line];
      inSection = true;
    } else if (inSection) {
      currentLines.push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Save last section
  if (inSection) {
    sections.push(buildSection(currentHeading, currentLines));
  }

  return {
    frontmatter,
    header: headerLines.join("\n"),
    sections,
  };
}

function buildSection(heading: string, lines: string[]): SkillSection {
  const raw = lines.join("\n");
  const referencedFiles = extractFileReferences(raw);
  return { heading, raw, referencedFiles };
}

/**
 * Detect file paths referenced in a section.
 * Looks for backtick-quoted paths and common patterns.
 */
function extractFileReferences(text: string): string[] {
  const refs = new Set<string>();

  // Match `path/to/file.ext` patterns in backticks
  const backtickPattern = /`([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)`/g;
  let match;
  while ((match = backtickPattern.exec(text)) !== null) {
    const path = match[1];
    // Filter out obvious non-file patterns
    if (!path.startsWith("http") && !path.includes("@") && path.includes("/")) {
      refs.add(path);
    }
  }

  // Match script/file references without backticks (scripts/foo.sh, etc.)
  const pathPattern = /(?:scripts|payload|bins)\/[a-zA-Z0-9_.-]+/g;
  while ((match = pathPattern.exec(text)) !== null) {
    refs.add(match[0]);
  }

  return [...refs];
}

/**
 * Reconstruct SKILL.md from selected sections.
 */
export function reconstructSkillMd(
  parsed: ParsedSkill,
  selectedIndices: number[],
): string {
  const parts: string[] = [];

  if (parsed.frontmatter) {
    parts.push(parsed.frontmatter);
  }

  parts.push(parsed.header);

  for (const idx of selectedIndices) {
    if (idx >= 0 && idx < parsed.sections.length) {
      parts.push(parsed.sections[idx].raw);
    }
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/**
 * Generate a short summary line for a section (first non-empty line after heading).
 */
export function sectionSummary(section: SkillSection, maxLen = 60): string {
  const lines = section.raw.split("\n").slice(1); // skip heading
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("```")) {
      return trimmed.length > maxLen
        ? trimmed.slice(0, maxLen - 3) + "..."
        : trimmed;
    }
  }
  return "";
}

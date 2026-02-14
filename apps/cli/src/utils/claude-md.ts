import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const SECTION_HEADER = "## Installed Skills (SkillPort)";
const ENTRY_RE = /^- (.+?) v(.+?) — (.+)$/;

interface SkillEntry {
  id: string;
  version: string;
  path: string;
}

function getClaudeMdPath(projectLocal: boolean): string {
  if (projectLocal) {
    return join(".claude", "CLAUDE.md");
  }
  return join(homedir(), ".claude", "CLAUDE.md");
}

function parseEntries(section: string): SkillEntry[] {
  const entries: SkillEntry[] = [];
  for (const line of section.split("\n")) {
    const m = line.match(ENTRY_RE);
    if (m) {
      entries.push({ id: m[1], version: m[2], path: m[3] });
    }
  }
  return entries;
}

function formatEntry(id: string, version: string, installPath: string): string {
  return `- ${id} v${version} — ${installPath}`;
}

function readClaudeMd(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function writeClaudeMd(path: string, content: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, content);
}

/**
 * Add or update a skill entry in CLAUDE.md.
 * Idempotent: if the skill is already listed with the same version, no change.
 * If listed with a different version, updates it.
 */
export function updateClaudeMd(
  skillId: string,
  version: string,
  installPath: string,
  options: { project?: boolean } = {},
): void {
  const mdPath = getClaudeMdPath(!!options.project);
  let content = readClaudeMd(mdPath);

  const newEntry = formatEntry(skillId, version, installPath);

  // Find the SkillPort section
  const sectionIdx = content.indexOf(SECTION_HEADER);

  if (sectionIdx === -1) {
    // Section doesn't exist — append it
    const section = `\n${SECTION_HEADER}\n${newEntry}\n`;
    content = content.trimEnd() + "\n" + section;
  } else {
    // Section exists — find its boundaries
    const afterHeader = sectionIdx + SECTION_HEADER.length;
    const nextSectionIdx = content.indexOf("\n## ", afterHeader + 1);
    const sectionEnd = nextSectionIdx === -1 ? content.length : nextSectionIdx;

    const sectionContent = content.substring(afterHeader, sectionEnd);
    const entries = parseEntries(sectionContent);

    // Check if already exists
    const existingIdx = entries.findIndex((e) => e.id === skillId);
    if (existingIdx !== -1) {
      if (entries[existingIdx].version === version && entries[existingIdx].path === installPath) {
        return; // Already up-to-date
      }
      // Update version/path
      entries[existingIdx] = { id: skillId, version, path: installPath };
    } else {
      entries.push({ id: skillId, version, path: installPath });
    }

    // Rebuild section
    const newSection = "\n" + entries.map((e) => formatEntry(e.id, e.version, e.path)).join("\n") + "\n";
    content = content.substring(0, afterHeader) + newSection + content.substring(sectionEnd);
  }

  writeClaudeMd(mdPath, content);
}

/**
 * Remove a skill entry from CLAUDE.md.
 * If the section becomes empty, remove the section header too.
 */
export function removeFromClaudeMd(
  skillId: string,
  options: { project?: boolean } = {},
): void {
  const mdPath = getClaudeMdPath(!!options.project);
  let content = readClaudeMd(mdPath);
  if (!content) return;

  const sectionIdx = content.indexOf(SECTION_HEADER);
  if (sectionIdx === -1) return;

  const afterHeader = sectionIdx + SECTION_HEADER.length;
  const nextSectionIdx = content.indexOf("\n## ", afterHeader + 1);
  const sectionEnd = nextSectionIdx === -1 ? content.length : nextSectionIdx;

  const sectionContent = content.substring(afterHeader, sectionEnd);
  const entries = parseEntries(sectionContent).filter((e) => e.id !== skillId);

  if (entries.length === 0) {
    // Remove entire section (header + content)
    // Also remove trailing newline before section if present
    const sectionStart = content.lastIndexOf("\n", sectionIdx - 1);
    const start = sectionStart === -1 ? sectionIdx : sectionStart;
    content = content.substring(0, start) + content.substring(sectionEnd);
  } else {
    const newSection = "\n" + entries.map((e) => formatEntry(e.id, e.version, e.path)).join("\n") + "\n";
    content = content.substring(0, afterHeader) + newSection + content.substring(sectionEnd);
  }

  writeClaudeMd(mdPath, content.trimEnd() + "\n");
}

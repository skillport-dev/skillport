import { createHash } from "node:crypto";

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function computeChecksums(
  files: Map<string, Buffer>,
): Record<string, string> {
  const checksums: Record<string, string> = {};
  for (const [path, content] of files) {
    checksums[path] = sha256(content);
  }
  return checksums;
}

export function verifyChecksums(
  files: Map<string, Buffer>,
  expected: Record<string, string>,
): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  for (const [path, expectedHash] of Object.entries(expected)) {
    const content = files.get(path);
    if (!content) {
      mismatches.push(path);
      continue;
    }
    const actual = sha256(content);
    if (actual !== expectedHash) {
      mismatches.push(path);
    }
  }

  return { valid: mismatches.length === 0, mismatches };
}

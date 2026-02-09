import JSZip from "jszip";
import { ManifestSchema, type Manifest } from "../manifest/schema.js";

export interface ExtractedSSP {
  manifest: Manifest;
  manifestRaw: string;
  files: Map<string, Buffer>;
  authorSignature: string | null;
  platformSignature: string | null;
  checksums: Record<string, string>;
  skillMd: string | null;
}

export async function extractSSP(data: Buffer): Promise<ExtractedSSP> {
  const zip = await JSZip.loadAsync(data);

  // Extract manifest
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Invalid SSP: missing manifest.json");
  }
  const manifestRaw = await manifestFile.async("string");
  const manifestData = JSON.parse(manifestRaw);
  const manifest = ManifestSchema.parse(manifestData);

  // Extract signatures
  const authorSigFile = zip.file("signatures/author.sig");
  const authorSignature = authorSigFile
    ? await authorSigFile.async("string")
    : null;

  const platformSigFile = zip.file("signatures/platform.sig");
  const platformSignature = platformSigFile
    ? await platformSigFile.async("string")
    : null;

  // Extract checksums
  const checksumsFile = zip.file("checksums.json");
  const checksums: Record<string, string> = checksumsFile
    ? JSON.parse(await checksumsFile.async("string"))
    : {};

  // Extract SKILL.md
  const skillMdFile = zip.file("SKILL.md");
  const skillMd = skillMdFile ? await skillMdFile.async("string") : null;

  // Extract all payload files
  const files = new Map<string, Buffer>();
  const entries = Object.entries(zip.files);
  for (const [path, entry] of entries) {
    if (entry.dir) continue;
    if (
      path === "manifest.json" ||
      path === "checksums.json" ||
      path === "SKILL.md" ||
      path.startsWith("signatures/")
    ) {
      continue;
    }
    const content = await entry.async("nodebuffer");
    files.set(path, content);
  }

  return {
    manifest,
    manifestRaw,
    files,
    authorSignature,
    platformSignature,
    checksums,
    skillMd,
  };
}

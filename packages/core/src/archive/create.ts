import JSZip from "jszip";
import { ManifestSchema, type Manifest } from "../manifest/schema.js";
import { computeChecksums } from "../crypto/checksum.js";
import { signManifest } from "../crypto/sign.js";

export interface CreateSSPOptions {
  manifest: Manifest;
  files: Map<string, Buffer>; // relative path -> content
  privateKeyPem: string;
}

export interface SSPContents {
  manifest: Manifest;
  files: Map<string, Buffer>;
  authorSignature: string;
  checksums: Record<string, string>;
}

export async function createSSP(options: CreateSSPOptions): Promise<Buffer> {
  const { manifest, files, privateKeyPem } = options;

  // Validate manifest
  ManifestSchema.parse(manifest);

  // Compute checksums for all files (SKILL.md at root, others under payload/)
  const checksumFiles = new Map<string, Buffer>();
  for (const [path, content] of files) {
    if (path === "SKILL.md") {
      checksumFiles.set(path, content);
    } else {
      checksumFiles.set(`payload/${path}`, content);
    }
  }

  const checksums = computeChecksums(checksumFiles);

  // Update manifest hashes
  const finalManifest: Manifest = {
    ...manifest,
    hashes: checksums,
  };

  const manifestJson = JSON.stringify(finalManifest, null, 2);
  const manifestBuffer = Buffer.from(manifestJson);

  // Sign manifest
  const authorSignature = signManifest(manifestJson, privateKeyPem);

  // Build ZIP
  const zip = new JSZip();
  zip.file("manifest.json", manifestBuffer);
  zip.file("signatures/author.sig", authorSignature);
  zip.file(
    "checksums.json",
    JSON.stringify(checksums, null, 2),
  );

  // Add SKILL.md if present in files
  const skillMd = files.get("SKILL.md");
  if (skillMd) {
    zip.file("SKILL.md", skillMd);
  }

  // Add payload files
  for (const [path, content] of files) {
    if (path !== "SKILL.md") {
      zip.file(`payload/${path}`, content);
    }
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  return buffer;
}

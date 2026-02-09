import { describe, it, expect } from "vitest";
import { createSSP, extractSSP, generateKeyPair, verifySignature } from "../index.js";
import type { Manifest } from "../index.js";

function testManifest(keyId: string): Manifest {
  return {
    ssp_version: "1.0",
    id: "test-author/test-skill",
    name: "Test Skill",
    description: "A test skill",
    version: "1.0.0",
    author: {
      name: "Test Author",
      signing_key_id: keyId,
    },
    openclaw_compat: ">=1.0.0",
    os_compat: ["macos", "linux"],
    entrypoints: [{ name: "main", file: "SKILL.md" }],
    permissions: {
      network: { mode: "none" },
      filesystem: { read_paths: [], write_paths: [] },
      exec: { allowed_commands: [], shell: false },
    },
    dependencies: [],
    danger_flags: [],
    install: { steps: [], required_inputs: [] },
    hashes: {},
    created_at: new Date().toISOString(),
  };
}

describe("Archive create/extract", () => {
  it("creates and extracts an SSP package", async () => {
    const kp = generateKeyPair();
    const files = new Map<string, Buffer>();
    files.set("SKILL.md", Buffer.from("# Test Skill\nA test skill."));
    files.set("script.sh", Buffer.from("echo hello"));

    const sspBuffer = await createSSP({
      manifest: testManifest(kp.keyId),
      files,
      privateKeyPem: kp.privateKey,
    });

    expect(sspBuffer).toBeInstanceOf(Buffer);
    expect(sspBuffer.length).toBeGreaterThan(0);

    const extracted = await extractSSP(sspBuffer);
    expect(extracted.manifest.id).toBe("test-author/test-skill");
    expect(extracted.manifest.name).toBe("Test Skill");
    expect(extracted.authorSignature).toBeTruthy();
    expect(extracted.skillMd).toBe("# Test Skill\nA test skill.");
    expect(Object.keys(extracted.checksums).length).toBeGreaterThan(0);
  });

  it("verifies author signature after extract", async () => {
    const kp = generateKeyPair();
    const files = new Map<string, Buffer>();
    files.set("SKILL.md", Buffer.from("# Test Skill"));

    const sspBuffer = await createSSP({
      manifest: testManifest(kp.keyId),
      files,
      privateKeyPem: kp.privateKey,
    });

    const extracted = await extractSSP(sspBuffer);

    // The signature was made against the serialized manifest
    const manifestJson = JSON.stringify(extracted.manifest, null, 2);
    const valid = verifySignature(
      manifestJson,
      extracted.authorSignature!,
      kp.publicKey,
    );
    expect(valid).toBe(true);
  });
});

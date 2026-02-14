import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  computeKeyId,
  signManifest,
  verifySignature,
  sha256,
  computeChecksums,
  verifyChecksums,
} from "../index.js";

describe("Key Generation", () => {
  it("generates a key pair", () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(kp.privateKey).toContain("BEGIN PRIVATE KEY");
    expect(kp.keyId).toHaveLength(16);
  });

  it("computes consistent key ID", () => {
    const kp = generateKeyPair();
    const id1 = computeKeyId(kp.publicKey);
    const id2 = computeKeyId(kp.publicKey);
    expect(id1).toBe(id2);
    expect(id1).toBe(kp.keyId);
  });
});

describe("Signing and Verification", () => {
  it("signs and verifies a manifest", () => {
    const kp = generateKeyPair();
    const manifest = JSON.stringify({ test: "data" });

    const signature = signManifest(manifest, kp.privateKey);
    expect(signature).toBeTruthy();
    expect(typeof signature).toBe("string");

    const valid = verifySignature(manifest, signature, kp.publicKey);
    expect(valid).toBe(true);
  });

  it("rejects tampered data", () => {
    const kp = generateKeyPair();
    const manifest = JSON.stringify({ test: "data" });

    const signature = signManifest(manifest, kp.privateKey);
    const tampered = JSON.stringify({ test: "tampered" });

    const valid = verifySignature(tampered, signature, kp.publicKey);
    expect(valid).toBe(false);
  });

  it("rejects wrong key", () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const manifest = JSON.stringify({ test: "data" });

    const signature = signManifest(manifest, kp1.privateKey);
    const valid = verifySignature(manifest, signature, kp2.publicKey);
    expect(valid).toBe(false);
  });
});

describe("Checksums", () => {
  it("computes SHA-256 hash", () => {
    const hash = sha256("hello");
    expect(hash).toHaveLength(64);
    expect(hash).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("computes and verifies file checksums", () => {
    const files = new Map<string, Buffer>();
    files.set("a.txt", Buffer.from("hello"));
    files.set("b.txt", Buffer.from("world"));

    const checksums = computeChecksums(files);
    expect(Object.keys(checksums)).toHaveLength(2);

    const { valid, mismatches } = verifyChecksums(files, checksums);
    expect(valid).toBe(true);
    expect(mismatches).toHaveLength(0);
  });

  it("detects tampered files", () => {
    const files = new Map<string, Buffer>();
    files.set("a.txt", Buffer.from("hello"));

    const checksums = computeChecksums(files);

    files.set("a.txt", Buffer.from("tampered"));
    const { valid, mismatches } = verifyChecksums(files, checksums);
    expect(valid).toBe(false);
    expect(mismatches).toContain("a.txt");
  });
});

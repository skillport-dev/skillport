import {
  generateKeyPairSync,
  createHash,
  createPublicKey,
  createPrivateKey,
  KeyObject,
} from "node:crypto";

export interface KeyPair {
  publicKey: string; // PEM
  privateKey: string; // PEM
  keyId: string;
}

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const keyId = computeKeyId(publicKey);
  return { publicKey, privateKey, keyId };
}

export function computeKeyId(publicKeyPem: string): string {
  const hash = createHash("sha256").update(publicKeyPem).digest("hex");
  return hash.substring(0, 16);
}

export function loadPublicKey(pem: string): KeyObject {
  return createPublicKey(pem);
}

export function loadPrivateKey(pem: string): KeyObject {
  return createPrivateKey(pem);
}

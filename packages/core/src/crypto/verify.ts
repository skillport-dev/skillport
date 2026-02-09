import { verify as cryptoVerify } from "node:crypto";
import { loadPublicKey } from "./keys.js";

export function verifySignature(
  manifestJson: string,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  const publicKey = loadPublicKey(publicKeyPem);
  const signature = Buffer.from(signatureBase64, "base64");
  return cryptoVerify(null, Buffer.from(manifestJson), publicKey, signature);
}

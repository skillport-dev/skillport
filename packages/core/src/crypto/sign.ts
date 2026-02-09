import { sign as cryptoSign } from "node:crypto";
import { loadPrivateKey } from "./keys.js";

export function signManifest(
  manifestJson: string,
  privateKeyPem: string,
): string {
  const privateKey = loadPrivateKey(privateKeyPem);
  const signature = cryptoSign(null, Buffer.from(manifestJson), privateKey);
  return signature.toString("base64");
}

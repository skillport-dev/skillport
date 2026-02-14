import { readFileSync, writeFileSync } from "node:fs";
import chalk from "chalk";
import { extractSSP, createSSP } from "@skillport/core";
import { hasKeys, loadPrivateKey } from "../utils/config.js";
import { isJsonMode, outputResult, outputError, EXIT } from "../utils/output.js";

export async function signCommand(sspPath: string): Promise<void> {
  if (!hasKeys()) {
    outputError("KEY_MISSING", "No keys found. Run 'skillport init' first.", {
      exitCode: EXIT.GENERAL,
      hints: ["Run 'skillport init' first"],
    });
    return;
  }

  if (!isJsonMode()) console.log(`Signing: ${sspPath}`);
  const data = readFileSync(sspPath);
  const extracted = await extractSSP(data);

  // Re-create with new signature
  const privateKey = loadPrivateKey();

  // Reconstruct files map (remove payload/ prefix)
  const files = new Map<string, Buffer>();
  for (const [path, content] of extracted.files) {
    const cleanPath = path.startsWith("payload/")
      ? path.substring(8)
      : path;
    files.set(cleanPath, content);
  }
  if (extracted.skillMd) {
    files.set("SKILL.md", Buffer.from(extracted.skillMd));
  }

  const sspBuffer = await createSSP({
    manifest: extracted.manifest,
    files,
    privateKeyPem: privateKey,
  });

  writeFileSync(sspPath, sspBuffer);

  if (isJsonMode()) {
    outputResult({ path: sspPath, signed: true });
    return;
  }

  console.log(chalk.green(`Package re-signed successfully: ${sspPath}`));
}

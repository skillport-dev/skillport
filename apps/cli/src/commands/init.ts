import { writeFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { generateKeyPair } from "@skillport/core";
import { ensureConfigDirs, keysDir, hasKeys, saveConfig, loadConfig } from "../utils/config.js";
import { isJsonMode, outputResult, outputError, EXIT } from "../utils/output.js";

export async function initCommand(): Promise<void> {
  if (hasKeys()) {
    if (isJsonMode()) {
      outputError("ALREADY_EXISTS", "Keys already exist.", { exitCode: EXIT.GENERAL });
    } else {
      console.log(chalk.yellow("Keys already exist."));
    }
    return;
  }

  ensureConfigDirs();

  if (!isJsonMode()) {
    console.log("Generating Ed25519 key pair...");
  }
  const keyPair = generateKeyPair();

  const dir = keysDir();
  writeFileSync(join(dir, "default.pub"), keyPair.publicKey);
  writeFileSync(join(dir, "default.key"), keyPair.privateKey, { mode: 0o600 });

  // Save default key ID to config
  const config = loadConfig();
  config.default_key_id = keyPair.keyId;
  saveConfig(config);

  if (isJsonMode()) {
    outputResult({
      key_id: keyPair.keyId,
      public_key_path: join(dir, "default.pub"),
    });
    return;
  }

  console.log(chalk.green("Key pair generated successfully!"));
  console.log(`  Key ID: ${chalk.bold(keyPair.keyId)}`);
  console.log(`  Public key: ${join(dir, "default.pub")}`);
  console.log(`  Private key: ${join(dir, "default.key")}`);
  console.log();
  console.log(
    chalk.dim("Register your public key with the marketplace using: skillport login"),
  );
}

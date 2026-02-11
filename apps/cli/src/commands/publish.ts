import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import { extractSSP, verifyChecksums, verifySignature } from "@skillport/core";
import { loadConfig } from "../utils/config.js";

export async function publishCommand(sspPath: string): Promise<void> {
  const config = loadConfig();

  if (!config.auth_token) {
    console.log(chalk.red("Not logged in. Run 'skillport login' first."));
    process.exitCode = 1;
    return;
  }

  // Validate SSP before upload
  console.log(`Validating: ${sspPath}`);
  const data = readFileSync(sspPath);
  const extracted = await extractSSP(data);

  // Verify checksums
  const { valid } = verifyChecksums(extracted.files, extracted.checksums);
  if (!valid) {
    console.log(chalk.red("Checksum verification failed. Cannot publish."));
    process.exitCode = 1;
    return;
  }

  if (!extracted.authorSignature) {
    console.log(chalk.red("No author signature. Sign the package first."));
    process.exitCode = 1;
    return;
  }

  // Verify signature locally before uploading
  const keyId = extracted.manifest.author.signing_key_id;
  const pubKeyPath = join(homedir(), ".skillport", "keys", "default.pub");
  if (existsSync(pubKeyPath)) {
    const pubKeyPem = readFileSync(pubKeyPath, "utf-8");
    const sigValid = verifySignature(
      extracted.manifestRaw,
      extracted.authorSignature,
      pubKeyPem,
    );
    if (!sigValid) {
      console.log(chalk.red("Signature verification failed. Package may have been tampered with after signing."));
      console.log(chalk.dim(`  Key ID: ${keyId}`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green("✓ Signature verified"));
  } else {
    console.log(chalk.yellow("⚠ Local public key not found — skipping local signature check"));
    console.log(chalk.dim("  Server will verify signature against registered key."));
  }

  // Upload to marketplace
  console.log("Uploading to marketplace...");

  try {
    const formData = new FormData();
    formData.append("file", new Blob([data]), sspPath.split("/").pop());

    const response = await fetch(`${config.marketplace_url}/v1/skills`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.auth_token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.json() as Record<string, unknown>;
      console.log(chalk.red(`Upload failed: ${errorBody.error || response.statusText}`));
      process.exitCode = 1;
      return;
    }

    const result = await response.json() as {
      id: string;
      ssp_id: string;
      version: string;
      version_id: string;
      scan_passed: boolean;
      risk_score: number;
    };
    console.log(chalk.green("Published successfully!"));
    console.log();
    console.log(`  ${chalk.bold("Skill ID:")}    ${result.id}`);
    console.log(`  ${chalk.bold("SSP ID:")}      ${result.ssp_id}`);
    console.log(`  ${chalk.bold("Version:")}     ${result.version}`);
    console.log(`  ${chalk.bold("Scan:")}        ${result.scan_passed ? chalk.green("PASSED") : chalk.red("FAILED")}`);
    console.log(`  ${chalk.bold("Risk Score:")}  ${result.risk_score}/100`);
    console.log();
    console.log(chalk.dim(`  URL: ${config.marketplace_url}/skills/${result.id}`));
    console.log(chalk.dim(`  Install: skillport install ${result.ssp_id}@${result.version}`));
  } catch (error) {
    console.log(chalk.red(`Upload failed: ${(error as Error).message}`));
    process.exitCode = 1;
  }
}

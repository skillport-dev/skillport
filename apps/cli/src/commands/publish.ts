import { readFileSync } from "node:fs";
import chalk from "chalk";
import { extractSSP, verifyChecksums } from "@skillport/core";
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

    const result = await response.json() as Record<string, unknown>;
    console.log(chalk.green("Published successfully!"));
    console.log(chalk.dim(`  URL: ${config.marketplace_url}/skills/${result.id}`));
  } catch (error) {
    console.log(chalk.red(`Upload failed: ${(error as Error).message}`));
    process.exitCode = 1;
  }
}

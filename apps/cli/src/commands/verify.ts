import { readFileSync } from "node:fs";
import chalk from "chalk";
import { extractSSP, verifySignature, verifyChecksums } from "@skillport/core";

export async function verifyCommand(
  sspPath: string,
  options: { publicKey?: string },
): Promise<void> {
  console.log(`Verifying: ${sspPath}`);
  const data = readFileSync(sspPath);
  const extracted = await extractSSP(data);

  let allPassed = true;

  // 1. Check author signature
  if (extracted.authorSignature) {
    let publicKeyPem: string | null = null;

    if (options.publicKey) {
      publicKeyPem = readFileSync(options.publicKey, "utf-8");
    }

    if (publicKeyPem) {
      const manifestJson = JSON.stringify(extracted.manifest, null, 2);
      const sigValid = verifySignature(
        manifestJson,
        extracted.authorSignature,
        publicKeyPem,
      );
      if (sigValid) {
        console.log(chalk.green("  Author signature: VALID"));
      } else {
        console.log(chalk.red("  Author signature: INVALID"));
        allPassed = false;
      }
    } else {
      console.log(chalk.yellow("  Author signature: PRESENT (no public key to verify)"));
    }
  } else {
    console.log(chalk.red("  Author signature: MISSING"));
    allPassed = false;
  }

  // 2. Check platform signature
  if (extracted.platformSignature) {
    console.log(chalk.green("  Platform signature: PRESENT"));
  } else {
    console.log(chalk.dim("  Platform signature: ABSENT"));
  }

  // 3. Verify checksums
  const { valid, mismatches } = verifyChecksums(
    extracted.files,
    extracted.checksums,
  );

  if (valid) {
    console.log(chalk.green("  Checksums: ALL VALID"));
  } else {
    console.log(chalk.red(`  Checksums: ${mismatches.length} MISMATCHES`));
    for (const path of mismatches) {
      console.log(chalk.red(`    - ${path}`));
    }
    allPassed = false;
  }

  console.log();
  if (allPassed) {
    console.log(chalk.green.bold("Verification PASSED"));
  } else {
    console.log(chalk.red.bold("Verification FAILED"));
    process.exitCode = 1;
  }
}

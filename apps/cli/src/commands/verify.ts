import { readFileSync } from "node:fs";
import chalk from "chalk";
import { extractSSP, verifySignature, verifyChecksums } from "@skillport/core";
import { isJsonMode, outputResult, outputError, EXIT } from "../utils/output.js";

export async function verifyCommand(
  sspPath: string,
  options: { publicKey?: string },
): Promise<void> {
  if (!isJsonMode()) console.log(`Verifying: ${sspPath}`);
  const data = readFileSync(sspPath);
  const extracted = await extractSSP(data);

  let allPassed = true;
  let authorSigStatus: "valid" | "invalid" | "present_unverified" | "missing" = "missing";
  const platformSigPresent = !!extracted.platformSignature;

  // 1. Check author signature
  if (extracted.authorSignature) {
    let publicKeyPem: string | null = null;

    if (options.publicKey) {
      publicKeyPem = readFileSync(options.publicKey, "utf-8");
    }

    if (publicKeyPem) {
      // Use raw manifest JSON (before Zod defaults) to match the signature
      const sigValid = verifySignature(
        extracted.manifestRaw,
        extracted.authorSignature,
        publicKeyPem,
      );
      authorSigStatus = sigValid ? "valid" : "invalid";
      if (!sigValid) allPassed = false;
    } else {
      authorSigStatus = "present_unverified";
    }
  } else {
    authorSigStatus = "missing";
    allPassed = false;
  }

  // 2. Verify checksums
  const { valid, mismatches } = verifyChecksums(
    extracted.files,
    extracted.checksums,
  );
  if (!valid) allPassed = false;

  if (isJsonMode()) {
    if (!allPassed) process.exitCode = EXIT.SECURITY_REJECTED;
    outputResult({
      author_signature: authorSigStatus,
      platform_signature: platformSigPresent,
      checksums_valid: valid,
      checksum_mismatches: mismatches,
      passed: allPassed,
    });
    return;
  }

  // Human-readable output
  switch (authorSigStatus) {
    case "valid":
      console.log(chalk.green("  Author signature: VALID"));
      break;
    case "invalid":
      console.log(chalk.red("  Author signature: INVALID"));
      break;
    case "present_unverified":
      console.log(chalk.yellow("  Author signature: PRESENT (no public key to verify)"));
      break;
    case "missing":
      console.log(chalk.red("  Author signature: MISSING"));
      break;
  }

  if (platformSigPresent) {
    console.log(chalk.green("  Platform signature: PRESENT"));
  } else {
    console.log(chalk.dim("  Platform signature: ABSENT"));
  }

  if (valid) {
    console.log(chalk.green("  Checksums: ALL VALID"));
  } else {
    console.log(chalk.red(`  Checksums: ${mismatches.length} MISMATCHES`));
    for (const path of mismatches) {
      console.log(chalk.red(`    - ${path}`));
    }
  }

  console.log();
  if (allPassed) {
    console.log(chalk.green.bold("Verification PASSED"));
  } else {
    console.log(chalk.red.bold("Verification FAILED"));
    process.exitCode = 1;
  }
}

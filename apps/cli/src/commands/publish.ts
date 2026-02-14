import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import { extractSSP, verifyChecksums, verifySignature } from "@skillport/core";
import { loadConfig, hasKeys, checkAuthReady } from "../utils/config.js";
import { registerPublicKey } from "../utils/register-key.js";
import { isJsonMode, outputResult, outputError, logProgress, EXIT } from "../utils/output.js";
import { checkPolicy } from "../utils/policy.js";
import { logProvenance, detectAgent } from "../utils/provenance.js";

export async function publishCommand(sspPath: string): Promise<void> {
  const config = loadConfig();

  const authError = checkAuthReady(config);
  if (authError) {
    outputError("AUTH_REQUIRED", authError, {
      exitCode: EXIT.AUTH_REQUIRED,
      hints: ["Run 'skillport login' to authenticate."],
    });
    return;
  }

  // Policy check
  const nonInteractive = isJsonMode();
  const policyResult = checkPolicy("publish", { nonInteractive });
  if (!policyResult.allowed) {
    outputError("POLICY_REJECTED", policyResult.reason!, {
      exitCode: EXIT.POLICY_REJECTED,
      hints: policyResult.hints,
    });
    return;
  }

  // Validate SSP before upload
  logProgress(`Validating: ${sspPath}`);
  const data = readFileSync(sspPath);
  const extracted = await extractSSP(data);

  // Verify checksums
  const { valid } = verifyChecksums(extracted.files, extracted.checksums);
  if (!valid) {
    outputError("CHECKSUM_MISMATCH", "Checksum verification failed. Cannot publish.", {
      exitCode: EXIT.SECURITY_REJECTED,
    });
    return;
  }

  if (!extracted.authorSignature) {
    outputError("SIGNATURE_MISSING", "No author signature. Sign the package first.", {
      exitCode: EXIT.SECURITY_REJECTED,
      hints: ["Run 'skillport sign <ssp>' first"],
    });
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
      outputError("SIGNATURE_INVALID", "Signature verification failed. Package may have been tampered with after signing.", {
        exitCode: EXIT.SECURITY_REJECTED,
        hints: [`Key ID: ${keyId}`],
      });
      return;
    }
    logProgress(chalk.green("✓ Signature verified"));
  } else {
    logProgress(chalk.yellow("⚠ Local public key not found — skipping local signature check"));
  }

  // Upload to marketplace
  logProgress("Uploading to marketplace...");

  async function upload(): Promise<Response> {
    const formData = new FormData();
    formData.append("file", new Blob([data]), sspPath.split("/").pop());
    return fetch(`${config.marketplace_url}/v1/skills`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.auth_token}` },
      body: formData,
    });
  }

  try {
    let response = await upload();

    // Auto-heal: register key and retry if not registered
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as Record<string, unknown>;
      const errorMsg = String(errorBody.error || "");

      if (errorMsg.includes("Signing key is not registered") && hasKeys()) {
        logProgress(chalk.yellow("Signing key not registered. Registering automatically..."));
        const registered = await registerPublicKey(config);
        if (registered) {
          logProgress("Retrying upload...");
          response = await upload();
        } else {
          outputError("KEY_NOT_REGISTERED", "Could not register key. Run 'skillport keys register' manually.", {
            exitCode: EXIT.GENERAL,
            hints: ["Run 'skillport keys register'"],
          });
          return;
        }
      }

      if (!response.ok) {
        const retryBody = await response.json().catch(() => ({})) as Record<string, unknown>;
        outputError("UPLOAD_FAILED", `Upload failed: ${retryBody.error || response.statusText}`, {
          exitCode: EXIT.NETWORK,
          retryable: true,
        });
        return;
      }
    }

    const result = await response.json() as {
      id: string;
      ssp_id: string;
      version: string;
      version_id: string;
      scan_passed: boolean;
      risk_score: number;
      status?: string;
    };

    logProvenance({
      action: "publish",
      agent: detectAgent(),
      skill_id: result.ssp_id,
      version: result.version,
      risk_score: result.risk_score,
      scan_passed: result.scan_passed,
      policy_allowed: true,
    });

    if (isJsonMode()) {
      outputResult({
        id: result.id,
        ssp_id: result.ssp_id,
        version: result.version,
        status: result.status || "draft",
        scan_passed: result.scan_passed,
        risk_score: result.risk_score,
      });
      return;
    }

    if (result.status === "published") {
      console.log(chalk.green("Version updated successfully!"));
    } else {
      console.log(chalk.green("Uploaded as draft."));
    }
    console.log();
    console.log(`  ${chalk.bold("Skill ID:")}    ${result.id}`);
    console.log(`  ${chalk.bold("SSP ID:")}      ${result.ssp_id}`);
    console.log(`  ${chalk.bold("Version:")}     ${result.version}`);
    console.log(`  ${chalk.bold("Status:")}      ${result.status === "published" ? chalk.green("published") : chalk.yellow(result.status || "draft")}`);
    console.log(`  ${chalk.bold("Scan:")}        ${result.scan_passed ? chalk.green("PASSED") : chalk.red("FAILED")}`);
    console.log(`  ${chalk.bold("Risk Score:")}  ${result.risk_score}/100`);
    console.log();
    if (result.status === "published") {
      console.log(chalk.dim(`  URL: ${config.marketplace_web_url}/skills/${result.id}`));
      console.log(chalk.dim(`  Install: skillport install ${result.ssp_id}@${result.version}`));
    } else {
      console.log(chalk.dim(`  Go to Dashboard to publish: ${config.marketplace_web_url}/dashboard`));
    }
  } catch (error) {
    outputError("UPLOAD_FAILED", `Upload failed: ${(error as Error).message}`, {
      exitCode: EXIT.NETWORK,
      retryable: true,
    });
  }
}

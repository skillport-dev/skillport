import { readFileSync, existsSync } from "node:fs";
import chalk from "chalk";
import {
  extractSSP,
  verifyChecksums,
} from "@skillport/core";
import {
  scanFiles,
  generateReport,
  isScannable,
} from "@skillport/scanner";
import {
  checkEnvironment,
} from "../utils/env-detect.js";
import {
  isJsonMode,
  outputResult,
  outputError,
  logProgress,
  logInfo,
  EXIT,
} from "../utils/output.js";

export interface InspectOptions {
  // currently no extra options beyond --json
}

export async function inspectCommand(
  target: string,
  _options: InspectOptions,
): Promise<void> {
  // 1. Load SSP — local file or marketplace
  let data: Buffer;

  if (existsSync(target)) {
    data = readFileSync(target);
  } else {
    // Resolve from marketplace
    logInfo(`Resolving from marketplace: ${target}`);

    const { loadConfig, checkAuthReady } = await import("../utils/config.js");
    const config = loadConfig();
    const authError = checkAuthReady(config);
    if (authError) {
      outputError("AUTH_REQUIRED", authError, {
        exitCode: EXIT.AUTH_REQUIRED,
        hints: ["Run 'skillport login' to authenticate."],
      });
      return;
    }

    let skillId = target;
    let version: string | undefined;
    const atIdx = target.lastIndexOf("@");
    if (atIdx > 0) {
      skillId = target.substring(0, atIdx);
      version = target.substring(atIdx + 1);
    }

    try {
      let resolvedId = skillId;
      if (skillId.includes("/")) {
        const searchRes = await fetch(
          `${config.marketplace_url}/v1/skills?q=${encodeURIComponent(skillId)}&per_page=1`,
          { headers: { Authorization: `Bearer ${config.auth_token}` } },
        );
        if (!searchRes.ok) {
          outputError("NETWORK_ERROR", `Marketplace search failed: ${searchRes.statusText}`, {
            exitCode: EXIT.NETWORK,
            retryable: true,
          });
          return;
        }
        const searchData = await searchRes.json() as { data: Array<{ id: string; ssp_id: string }> };
        const match = searchData.data.find((s) => s.ssp_id === skillId);
        if (!match) {
          outputError("NOT_FOUND", `Skill not found: ${skillId}`, {
            exitCode: EXIT.GENERAL,
          });
          return;
        }
        resolvedId = match.id;
      }

      const dlUrl = version
        ? `${config.marketplace_url}/v1/skills/${resolvedId}/download?version=${version}`
        : `${config.marketplace_url}/v1/skills/${resolvedId}/download`;

      const dlRes = await fetch(dlUrl, {
        headers: { Authorization: `Bearer ${config.auth_token}` },
      });
      if (!dlRes.ok) {
        const err = await dlRes.json() as Record<string, unknown>;
        outputError("NETWORK_ERROR", `Download failed: ${(err.error as string) || dlRes.statusText}`, {
          exitCode: EXIT.NETWORK,
          retryable: true,
        });
        return;
      }

      const { url } = await dlRes.json() as { url: string };
      logInfo("Downloading package...");
      const fileRes = await fetch(url);
      if (!fileRes.ok) {
        outputError("NETWORK_ERROR", "Failed to download package file.", {
          exitCode: EXIT.NETWORK,
          retryable: true,
        });
        return;
      }
      data = Buffer.from(await fileRes.arrayBuffer());
    } catch (err) {
      outputError("NETWORK_ERROR", `Marketplace error: ${(err as Error).message}`, {
        exitCode: EXIT.NETWORK,
        retryable: true,
      });
      return;
    }
  }

  // 2. Extract and analyze
  logProgress("Inspecting package...");
  const extracted = await extractSSP(data);
  const { manifest } = extracted;

  // 3. Checksum verification
  const checksumResult = verifyChecksums(extracted.files, extracted.checksums);

  // 4. Security scan
  const textFiles = new Map<string, string>();
  for (const [path, content] of extracted.files) {
    if (isScannable(path)) {
      textFiles.set(path, content.toString("utf-8"));
    }
  }
  const scanResult = scanFiles(textFiles);
  const report = generateReport(
    scanResult.issues,
    scanResult.scannedFiles,
    scanResult.skippedFiles,
  );

  // 5. Environment check
  const envReport = checkEnvironment(manifest);

  // 6. Calculate install size
  let installSizeBytes = 0;
  for (const [, content] of extracted.files) {
    installSizeBytes += content.length;
  }

  // 7. Build result
  const inspectData = {
    manifest: {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      author: manifest.author,
      platform: manifest.platform,
      os_compat: manifest.os_compat,
      openclaw_compat: manifest.openclaw_compat,
      dependencies: manifest.dependencies,
      permissions: manifest.permissions,
      entrypoints: manifest.entrypoints,
      danger_flags: manifest.danger_flags,
      declared_risk: manifest.declared_risk,
    },
    security: {
      risk_score: report.risk_score,
      scan_passed: report.passed,
      issues: report.issues.map((i) => ({
        id: i.id,
        severity: i.severity,
        message: i.message,
        file: i.file,
        line: i.line,
      })),
      checksums_valid: checksumResult.valid,
      author_signature: !!extracted.authorSignature,
      platform_signature: !!extracted.platformSignature,
    },
    quality: {
      detected_deps: manifest.dependencies.map((d) => d.name),
      missing_deps: envReport.binaries
        .filter((b) => b.status === "missing")
        .map((b) => b.check),
    },
    inputs: manifest.inputs,
    outputs: manifest.outputs,
    scope: manifest.scope,
    estimated_duration_seconds: manifest.estimated_duration_seconds ?? null,
    estimated_tokens: manifest.estimated_tokens ?? null,
    install_size_bytes: installSizeBytes,
    files_count: extracted.files.size,
  };

  if (isJsonMode()) {
    outputResult(inspectData);
    return;
  }

  // Human-readable output
  console.log(chalk.bold(`\n${manifest.name} v${manifest.version}`));
  console.log(chalk.dim(`  ID: ${manifest.id}`));
  console.log(chalk.dim(`  Author: ${manifest.author.name}`));
  console.log(chalk.dim(`  Platform: ${manifest.platform} | OS: ${manifest.os_compat.join(", ")}`));
  console.log(chalk.dim(`  ${manifest.description}`));
  console.log();

  // Security
  console.log(chalk.bold("Security:"));
  console.log(`  ${checksumResult.valid ? chalk.green("✓") : chalk.red("✗")} Checksums`);
  console.log(`  ${extracted.authorSignature ? chalk.green("✓") : chalk.red("✗")} Author signature`);
  console.log(`  ${extracted.platformSignature ? chalk.green("✓") : chalk.dim("-")} Platform signature`);
  console.log(`  ${report.passed ? chalk.green("✓") : chalk.red("✗")} Scan (risk: ${report.risk_score}/100)`);
  if (report.issues.length > 0) {
    for (const issue of report.issues) {
      const icon = issue.severity === "critical" || issue.severity === "high"
        ? chalk.red("!")
        : chalk.yellow("!");
      console.log(`    ${icon} [${issue.severity}] ${issue.message}${issue.file ? ` (${issue.file})` : ""}`);
    }
  }
  console.log();

  // Inputs/Outputs
  if (manifest.inputs.length > 0) {
    console.log(chalk.bold("Inputs:"));
    for (const input of manifest.inputs) {
      const req = input.required ? chalk.red("*") : chalk.dim("?");
      console.log(`  ${req} ${input.name} ${chalk.dim(`(${input.type})`)} — ${input.description}`);
    }
    console.log();
  }

  if (manifest.outputs.length > 0) {
    console.log(chalk.bold("Outputs:"));
    for (const output of manifest.outputs) {
      console.log(`  → ${output.name} ${chalk.dim(`(${output.type})`)} — ${output.description}`);
    }
    console.log();
  }

  // Scope
  const scopeEntries = Object.entries(manifest.scope).filter(([, v]) => v);
  if (scopeEntries.length > 0) {
    console.log(chalk.bold("Scope:"));
    for (const [key] of scopeEntries) {
      console.log(`  ${chalk.yellow("•")} ${key}`);
    }
    console.log();
  }

  // Dependencies
  if (manifest.dependencies.length > 0) {
    console.log(chalk.bold("Dependencies:"));
    for (const dep of manifest.dependencies) {
      const envCheck = envReport.binaries.find((b) => b.check === dep.name);
      const icon = envCheck
        ? envCheck.status === "ok" ? chalk.green("✓") : chalk.red("✗")
        : chalk.dim("-");
      console.log(`  ${icon} ${dep.name} ${chalk.dim(`(${dep.type})`)}`);
    }
    console.log();
  }

  // Meta
  console.log(chalk.dim(`  Declared risk: ${manifest.declared_risk}`));
  if (manifest.estimated_duration_seconds) {
    console.log(chalk.dim(`  Est. duration: ${manifest.estimated_duration_seconds}s`));
  }
  if (manifest.estimated_tokens) {
    console.log(chalk.dim(`  Est. tokens: ${manifest.estimated_tokens}`));
  }
  console.log(chalk.dim(`  Size: ${(installSizeBytes / 1024).toFixed(1)} KB (${extracted.files.size} files)`));
}

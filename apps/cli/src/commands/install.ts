import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  extractSSP,
  verifyChecksums,
  assessPermissions,
} from "@skillport/core";
import {
  scanFiles,
  generateReport,
  isScannable,
} from "@skillport/scanner";
import { OPENCLAW_SKILLS_DIR } from "@skillport/shared";
import {
  loadRegistry,
  saveRegistry,
  appendAuditLog,
} from "../utils/config.js";
import {
  displayScanReport,
  displayPermissions,
  displayDangerFlags,
} from "../utils/display.js";

export async function installCommand(
  target: string,
  options: { acceptRisk?: boolean },
): Promise<void> {
  // 1. Load SSP — local file or download from marketplace
  let data: Buffer;
  if (existsSync(target)) {
    data = readFileSync(target);
  } else {
    // Try to resolve as marketplace skill ID (e.g. "author/skill@1.0.0" or UUID)
    console.log(chalk.dim(`Resolving from marketplace: ${target}`));

    const { loadConfig } = await import("../utils/config.js");
    const config = loadConfig();
    if (!config.auth_token) {
      console.log(chalk.red("Not logged in. Run 'skillport login' first."));
      process.exitCode = 1;
      return;
    }

    // Parse target — could be "skill-id@version" or just "skill-id"
    let skillId = target;
    let version: string | undefined;
    const atIdx = target.lastIndexOf("@");
    if (atIdx > 0) {
      skillId = target.substring(0, atIdx);
      version = target.substring(atIdx + 1);
    }

    try {
      // Search by ssp_id if it contains "/"
      let resolvedId = skillId;
      if (skillId.includes("/")) {
        const searchRes = await fetch(
          `${config.marketplace_url}/v1/skills?q=${encodeURIComponent(skillId)}&per_page=1`,
          { headers: { Authorization: `Bearer ${config.auth_token}` } },
        );
        if (!searchRes.ok) {
          console.log(chalk.red(`Marketplace search failed: ${searchRes.statusText}`));
          process.exitCode = 1;
          return;
        }
        const searchData = await searchRes.json() as { data: Array<{ id: string; ssp_id: string }> };
        const match = searchData.data.find((s) => s.ssp_id === skillId);
        if (!match) {
          console.log(chalk.red(`Skill not found: ${skillId}`));
          process.exitCode = 1;
          return;
        }
        resolvedId = match.id;
      }

      // Get download URL
      const dlUrl = version
        ? `${config.marketplace_url}/v1/skills/${resolvedId}/download?version=${version}`
        : `${config.marketplace_url}/v1/skills/${resolvedId}/download`;

      const dlRes = await fetch(dlUrl, {
        headers: { Authorization: `Bearer ${config.auth_token}` },
      });
      if (!dlRes.ok) {
        const err = await dlRes.json() as Record<string, unknown>;
        console.log(chalk.red(`Download failed: ${err.error || dlRes.statusText}`));
        process.exitCode = 1;
        return;
      }

      const { url } = await dlRes.json() as { url: string };

      // Download the actual file
      console.log(chalk.dim("Downloading package..."));
      const fileRes = await fetch(url);
      if (!fileRes.ok) {
        console.log(chalk.red("Failed to download package file."));
        process.exitCode = 1;
        return;
      }
      data = Buffer.from(await fileRes.arrayBuffer());
      console.log(chalk.green(`  Downloaded ${(data.length / 1024).toFixed(1)} KB`));
    } catch (err) {
      console.log(chalk.red(`Marketplace error: ${(err as Error).message}`));
      process.exitCode = 1;
      return;
    }
  }

  console.log("Extracting SkillPort package...");
  const extracted = await extractSSP(data);
  const { manifest } = extracted;

  // 2. Verify checksums
  console.log("Verifying checksums...");
  const { valid, mismatches } = verifyChecksums(
    extracted.files,
    extracted.checksums,
  );
  if (!valid) {
    console.log(chalk.red("Checksum verification FAILED. Aborting install."));
    for (const path of mismatches) {
      console.log(chalk.red(`  Mismatch: ${path}`));
    }
    process.exitCode = 1;
    return;
  }
  console.log(chalk.green("  Checksums verified."));

  // 3. Verify signatures
  if (extracted.authorSignature) {
    console.log(chalk.green("  Author signature present."));
  } else {
    console.log(chalk.red("  No author signature. Aborting install."));
    process.exitCode = 1;
    return;
  }

  if (extracted.platformSignature) {
    console.log(chalk.green("  Platform signature present."));
  }

  // 4. Local re-scan
  console.log("Running local security scan...");
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

  displayScanReport(report);

  // 5. Permission consent
  displayPermissions(manifest.permissions);
  displayDangerFlags(manifest.danger_flags);

  const permSummary = assessPermissions(manifest.permissions);

  // Check if --accept-risk is required
  const requiresAcceptRisk =
    manifest.permissions.exec.shell ||
    manifest.danger_flags.some((f) => f.severity === "critical");

  if (requiresAcceptRisk && !options.acceptRisk) {
    console.log(
      chalk.red(
        "This skill requires shell access or has critical danger flags.",
      ),
    );
    console.log(
      chalk.red("Use --accept-risk to acknowledge and proceed."),
    );
    process.exitCode = 1;
    return;
  }

  // Prompt for confirmation
  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Install ${manifest.name} v${manifest.version}?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log("Installation cancelled.");
    return;
  }

  // 6. Install to ~/.openclaw/skills/
  const [authorSlug, skillSlug] = manifest.id.split("/");
  const installDir = join(
    homedir(),
    OPENCLAW_SKILLS_DIR,
    authorSlug,
    skillSlug,
  );
  mkdirSync(installDir, { recursive: true });

  // Write manifest
  writeFileSync(
    join(installDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  // Write SKILL.md
  if (extracted.skillMd) {
    writeFileSync(join(installDir, "SKILL.md"), extracted.skillMd);
  }

  // Write payload files
  for (const [path, content] of extracted.files) {
    const cleanPath = path.startsWith("payload/") ? path.substring(8) : path;
    const filePath = join(installDir, cleanPath);
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, content);
  }

  // 7. Collect required inputs
  if (manifest.install.required_inputs.length > 0) {
    console.log(chalk.bold("\nRequired configuration:"));
    const inputAnswers = await inquirer.prompt(
      manifest.install.required_inputs.map((input) => ({
        type: input.type === "secret" ? "password" : "input",
        name: input.key,
        message: input.description,
        default: input.default?.toString(),
      })),
    );

    // Save inputs as .env in install dir
    const envContent = Object.entries(inputAnswers)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    writeFileSync(join(installDir, ".env"), envContent, { mode: 0o600 });
  }

  // 8. Update registry
  const registry = loadRegistry();
  registry.skills = registry.skills.filter((s) => s.id !== manifest.id);
  registry.skills.push({
    id: manifest.id,
    version: manifest.version,
    installed_at: new Date().toISOString(),
    install_path: installDir,
    author_key_id: manifest.author.signing_key_id,
  });
  saveRegistry(registry);

  // 9. Audit log
  appendAuditLog({
    action: "install",
    skill_id: manifest.id,
    version: manifest.version,
    risk_score: report.risk_score,
    install_path: installDir,
  });

  console.log(chalk.green(`\nInstalled: ${manifest.name} v${manifest.version}`));
  console.log(chalk.dim(`  Location: ${installDir}`));
}

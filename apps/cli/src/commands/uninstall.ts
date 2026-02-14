import { rmSync, existsSync, readdirSync } from "node:fs";
import chalk from "chalk";
import inquirer from "inquirer";
import { loadRegistry, saveRegistry, appendAuditLog } from "../utils/config.js";
import { isJsonMode, outputResult, outputError, EXIT } from "../utils/output.js";
import { removeFromClaudeMd } from "../utils/claude-md.js";
import { checkPolicy } from "../utils/policy.js";
import { logProvenance, detectAgent } from "../utils/provenance.js";

export async function uninstallCommand(
  skillId: string,
  options: { yes?: boolean },
): Promise<void> {
  const registry = loadRegistry();
  const skill = registry.skills.find((s) => s.id === skillId);

  if (!skill) {
    outputError("NOT_FOUND", `Skill not found in registry: ${skillId}`, {
      exitCode: EXIT.INPUT_INVALID,
      hints: registry.skills.map((s) => `Installed: ${s.id} v${s.version}`),
    });
    return;
  }

  // Policy check
  const nonInteractive = !!(options.yes || isJsonMode());
  const policyResult = checkPolicy("uninstall", { nonInteractive });
  if (!policyResult.allowed) {
    outputError("POLICY_REJECTED", policyResult.reason!, {
      exitCode: EXIT.POLICY_REJECTED,
      hints: policyResult.hints,
    });
    return;
  }

  if (!options.yes) {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Uninstall ${skill.id} v${skill.version}?`,
        default: false,
      },
    ]);

    if (!confirm) {
      if (!isJsonMode()) console.log("Uninstall cancelled.");
      return;
    }
  }

  // Remove files
  if (existsSync(skill.install_path)) {
    rmSync(skill.install_path, { recursive: true });
    if (!isJsonMode()) {
      console.log(chalk.dim(`  Removed: ${skill.install_path}`));
    }
  }

  // Update registry
  registry.skills = registry.skills.filter((s) => s.id !== skillId);
  saveRegistry(registry);

  // Audit + provenance log
  appendAuditLog({
    action: "uninstall",
    skill_id: skillId,
    version: skill.version,
  });

  logProvenance({
    action: "uninstall",
    agent: detectAgent(),
    skill_id: skillId,
    version: skill.version,
    install_path: skill.install_path,
    policy_allowed: true,
  });

  // Remove from CLAUDE.md
  try {
    removeFromClaudeMd(skillId);
  } catch {
    // Non-fatal
  }

  if (isJsonMode()) {
    outputResult({ skill_id: skillId, removed: true });
    return;
  }

  console.log(chalk.green(`Uninstalled: ${skillId}`));
}

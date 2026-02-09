import { rmSync, existsSync } from "node:fs";
import chalk from "chalk";
import inquirer from "inquirer";
import { loadRegistry, saveRegistry, appendAuditLog } from "../utils/config.js";

export async function uninstallCommand(skillId: string): Promise<void> {
  const registry = loadRegistry();
  const skill = registry.skills.find((s) => s.id === skillId);

  if (!skill) {
    console.log(chalk.red(`Skill not found in registry: ${skillId}`));
    console.log(chalk.dim("Installed skills:"));
    for (const s of registry.skills) {
      console.log(chalk.dim(`  ${s.id} v${s.version}`));
    }
    process.exitCode = 1;
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Uninstall ${skill.id} v${skill.version}?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log("Uninstall cancelled.");
    return;
  }

  // Remove files
  if (existsSync(skill.install_path)) {
    rmSync(skill.install_path, { recursive: true });
    console.log(chalk.dim(`  Removed: ${skill.install_path}`));
  }

  // Update registry
  registry.skills = registry.skills.filter((s) => s.id !== skillId);
  saveRegistry(registry);

  // Audit log
  appendAuditLog({
    action: "uninstall",
    skill_id: skillId,
    version: skill.version,
  });

  console.log(chalk.green(`Uninstalled: ${skillId}`));
}

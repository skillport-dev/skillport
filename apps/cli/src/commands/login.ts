import chalk from "chalk";
import { loadConfig, saveConfig } from "../utils/config.js";

export async function loginCommand(): Promise<void> {
  // Phase 3 implementation: OAuth flow with browser redirect
  // For now, support manual token entry
  const config = loadConfig();

  console.log(chalk.bold("SkillPort Market Login"));
  console.log(chalk.dim(`Marketplace: ${config.marketplace_url}`));
  console.log();

  const inquirer = await import("inquirer");
  const { token } = await inquirer.default.prompt([
    {
      type: "password",
      name: "token",
      message: "Enter your API token:",
    },
  ]);

  config.auth_token = token;
  saveConfig(config);

  console.log(chalk.green("Login successful! Token saved."));
}

import chalk from "chalk";
import { loadConfig, hasKeys } from "../utils/config.js";
import { registerPublicKey } from "../utils/register-key.js";

export async function keysRegisterCommand(): Promise<void> {
  const config = loadConfig();

  if (!config.auth_token) {
    console.log(chalk.red("Not logged in. Run 'skillport login' first."));
    process.exitCode = 1;
    return;
  }

  if (!hasKeys()) {
    console.log(chalk.red("No signing keys found. Run 'skillport init' first."));
    process.exitCode = 1;
    return;
  }

  const ok = await registerPublicKey(config);
  if (!ok) {
    process.exitCode = 1;
  }
}

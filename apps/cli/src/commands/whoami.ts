import { existsSync } from "node:fs";
import chalk from "chalk";
import { computeKeyId } from "@skillport/core";
import {
  loadConfig,
  configPath,
  hasKeys,
  loadPublicKey,
  isTokenExpired,
} from "../utils/config.js";
import { isJsonMode, outputResult } from "../utils/output.js";

interface WhoamiResult {
  config_path: string;
  config_exists: boolean;
  marketplace_url: string;
  marketplace_web_url: string;
  authenticated: boolean;
  default_key_id: string | null;
  keys_exist: boolean;
  local_key_id: string | null;
}

function gather(): WhoamiResult {
  const cfgPath = configPath();
  const cfgExists = existsSync(cfgPath);
  const config = loadConfig();
  const keysExist = hasKeys();

  let localKeyId: string | null = null;
  if (keysExist) {
    try {
      const pem = loadPublicKey();
      localKeyId = computeKeyId(pem);
    } catch {
      // keys exist but unreadable
    }
  }

  return {
    config_path: cfgPath,
    config_exists: cfgExists,
    marketplace_url: config.marketplace_url,
    marketplace_web_url: config.marketplace_web_url,
    authenticated: !!config.auth_token,
    default_key_id: config.default_key_id ?? null,
    keys_exist: keysExist,
    local_key_id: localKeyId,
  };
}

export function whoamiCommand(opts: { json?: boolean }): void {
  const info = gather();

  if (isJsonMode()) {
    outputResult(info as unknown as Record<string, unknown>);
    return;
  }

  console.log(chalk.bold("SkillPort CLI"));
  console.log();
  console.log(`  ${chalk.bold("Config:")}        ${info.config_exists ? chalk.green(info.config_path) : chalk.yellow("not created yet")}`);
  console.log(`  ${chalk.bold("API:")}           ${info.marketplace_url}`);
  console.log(`  ${chalk.bold("Web:")}           ${info.marketplace_web_url}`);
  const config = loadConfig();
  const expired = isTokenExpired(config);
  const authLabel = !info.authenticated ? chalk.red("no") : expired ? chalk.red("expired") : chalk.green("yes");
  console.log(`  ${chalk.bold("Authenticated:")} ${authLabel}`);
  console.log(`  ${chalk.bold("Signing keys:")}  ${info.keys_exist ? chalk.green("present") : chalk.red("not found")}`);
  if (info.local_key_id) {
    console.log(`  ${chalk.bold("Key ID:")}        ${info.local_key_id}`);
  }
  if (info.default_key_id) {
    console.log(`  ${chalk.bold("Default key:")}   ${info.default_key_id}`);
  }
}

import { existsSync } from "node:fs";
import chalk from "chalk";
import { computeKeyId } from "@skillport/core";
import {
  loadConfig,
  configPath,
  hasKeys,
  loadPublicKey,
} from "../utils/config.js";
import { isJsonMode, outputResult } from "../utils/output.js";

interface Check {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

interface DoctorResult {
  checks: Check[];
  ok: boolean;
}

async function fetchHealth(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchWebReachable(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok || res.status === 308 || res.status === 307;
  } catch {
    return false;
  }
}

async function runChecks(): Promise<DoctorResult> {
  const checks: Check[] = [];
  const config = loadConfig();

  // 1. Config file
  const cfgExists = existsSync(configPath());
  checks.push({
    name: "config",
    status: cfgExists ? "ok" : "warn",
    message: cfgExists ? `Found: ${configPath()}` : "No config file (using defaults)",
  });

  // 2. Auth token
  checks.push({
    name: "auth",
    status: config.auth_token ? "ok" : "warn",
    message: config.auth_token
      ? "Authenticated"
      : "Not logged in — run 'skillport login'",
  });

  // 3. Signing keys
  const keysExist = hasKeys();
  let keyMsg = "Not found — run 'skillport init'";
  if (keysExist) {
    try {
      const pem = loadPublicKey();
      const kid = computeKeyId(pem);
      keyMsg = `Present (key ID: ${kid})`;
    } catch {
      keyMsg = "Files exist but unreadable";
    }
  }
  checks.push({
    name: "keys",
    status: keysExist ? "ok" : "warn",
    message: keyMsg,
  });

  // 4. API reachability
  const apiOk = await fetchHealth(config.marketplace_url);
  checks.push({
    name: "api",
    status: apiOk ? "ok" : "fail",
    message: apiOk
      ? `Reachable: ${config.marketplace_url}`
      : `Unreachable: ${config.marketplace_url}`,
  });

  // 5. Web reachability
  const webOk = await fetchWebReachable(config.marketplace_web_url);
  checks.push({
    name: "web",
    status: webOk ? "ok" : "fail",
    message: webOk
      ? `Reachable: ${config.marketplace_web_url}`
      : `Unreachable: ${config.marketplace_web_url}`,
  });

  // 6. Key registration (only if authenticated + has keys)
  if (config.auth_token && keysExist) {
    try {
      const pem = loadPublicKey();
      const kid = computeKeyId(pem);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${config.marketplace_url}/v1/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.auth_token}`,
        },
        body: JSON.stringify({ public_key_pem: pem, label: "default" }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok || res.status === 409) {
        checks.push({
          name: "key_registered",
          status: "ok",
          message: `Key ${kid} is registered on marketplace`,
        });
      } else {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        checks.push({
          name: "key_registered",
          status: "warn",
          message: `Key registration check failed: ${body.error || res.statusText}`,
        });
      }
    } catch {
      checks.push({
        name: "key_registered",
        status: "warn",
        message: "Could not verify key registration (API unreachable)",
      });
    }
  }

  const ok = checks.every((c) => c.status !== "fail");
  return { checks, ok };
}

export async function doctorCommand(opts: { json?: boolean }): Promise<void> {
  if (!isJsonMode()) {
    console.log(chalk.bold("SkillPort Doctor"));
    console.log();
  }

  const result = await runChecks();

  if (isJsonMode()) {
    outputResult(result as unknown as Record<string, unknown>);
  } else {
    for (const check of result.checks) {
      const icon =
        check.status === "ok"
          ? chalk.green("OK")
          : check.status === "warn"
            ? chalk.yellow("WARN")
            : chalk.red("FAIL");
      console.log(`  [${icon}] ${chalk.bold(check.name)}: ${check.message}`);
    }
    console.log();
    if (result.ok) {
      console.log(chalk.green("All critical checks passed."));
    } else {
      console.log(chalk.red("Some checks failed. See above for details."));
      process.exitCode = 1;
    }
  }
}

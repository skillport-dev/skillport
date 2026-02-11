import chalk from "chalk";
import { hasKeys, loadPublicKey, type SkillPortConfig } from "./config.js";

/**
 * Register the local public key with the marketplace.
 * Returns true if registration succeeded or key was already registered.
 */
export async function registerPublicKey(config: SkillPortConfig): Promise<boolean> {
  if (!hasKeys()) {
    return false;
  }

  try {
    const publicKey = loadPublicKey();
    const res = await fetch(`${config.marketplace_url}/v1/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.auth_token}`,
      },
      body: JSON.stringify({ public_key_pem: publicKey, label: "default" }),
    });

    if (res.ok || res.status === 409) {
      // 409 = key already registered — that's fine
      console.log(chalk.dim("  Public key registered with marketplace."));
      return true;
    }

    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    console.log(chalk.yellow(`  Warning: Could not register public key: ${body.error || res.statusText}`));
    return false;
  } catch {
    console.log(chalk.yellow("  Warning: Could not reach marketplace to register public key."));
    return false;
  }
}

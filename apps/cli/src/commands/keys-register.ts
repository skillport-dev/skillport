import chalk from "chalk";
import { loadConfig, hasKeys } from "../utils/config.js";
import { registerPublicKey } from "../utils/register-key.js";
import { isJsonMode, outputResult, outputError, EXIT } from "../utils/output.js";

export async function keysRegisterCommand(): Promise<void> {
  const config = loadConfig();

  if (!config.auth_token) {
    outputError("AUTH_REQUIRED", "Not logged in. Run 'skillport login' first.", {
      exitCode: EXIT.AUTH_REQUIRED,
      hints: ["Run 'skillport login'"],
    });
    return;
  }

  if (!hasKeys()) {
    outputError("KEY_MISSING", "No signing keys found. Run 'skillport init' first.", {
      exitCode: EXIT.GENERAL,
      hints: ["Run 'skillport init'"],
    });
    return;
  }

  const ok = await registerPublicKey(config);

  if (isJsonMode()) {
    if (ok) {
      outputResult({ registered: true });
    } else {
      outputError("REGISTRATION_FAILED", "Could not register key with marketplace.", {
        exitCode: EXIT.NETWORK,
        retryable: true,
      });
    }
    return;
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

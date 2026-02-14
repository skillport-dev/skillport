import chalk from "chalk";
import { loadConfig } from "../utils/config.js";
import { isJsonMode, outputResult, outputError, EXIT } from "../utils/output.js";
import { checkPolicy } from "../utils/policy.js";
import { logProvenance, detectAgent } from "../utils/provenance.js";

type Action = "publish" | "unpublish" | "delete" | "set-price";

const ACTION_DESC: Record<Action, string> = {
  publish: "Publishing skill (draft → published)...",
  unpublish: "Unpublishing skill (published → draft)...",
  delete: "Deleting skill...",
  "set-price": "Updating skill price...",
};

const ACTION_SUCCESS: Record<Action, string> = {
  publish: "Skill published! It is now live on the marketplace.",
  unpublish: "Skill unpublished. It is now in draft.",
  delete: "Skill deleted. It is no longer visible on the marketplace.",
  "set-price": "Skill price updated.",
};

export async function manageCommand(skillId: string, action: string, extraArgs?: string[]): Promise<void> {
  const validActions: Action[] = ["publish", "unpublish", "delete", "set-price"];

  if (!validActions.includes(action as Action)) {
    outputError("INPUT_INVALID", `Invalid action: ${action}`, {
      exitCode: EXIT.INPUT_INVALID,
      hints: [`Valid actions: ${validActions.join(", ")}`],
    });
    return;
  }

  // Policy check — "manage:delete", "manage:unpublish", etc.
  const policyAction = `manage:${action}`;
  const nonInteractive = isJsonMode();
  const policyResult = checkPolicy(policyAction, { nonInteractive });
  if (!policyResult.allowed) {
    outputError("POLICY_REJECTED", policyResult.reason!, {
      exitCode: EXIT.POLICY_REJECTED,
      hints: policyResult.hints,
    });
    return;
  }

  const config = loadConfig();

  if (!config.auth_token) {
    outputError("AUTH_REQUIRED", "Not logged in. Run 'skillport login' first.", {
      exitCode: EXIT.AUTH_REQUIRED,
      hints: ["Run 'skillport login'"],
    });
    return;
  }

  const act = action as Action;

  if (act === "set-price") {
    const priceArg = extraArgs?.[0];
    if (priceArg === undefined || priceArg === "") {
      outputError("INPUT_INVALID", "Missing price. Usage: skillport manage <skill-id> set-price <dollars>", {
        exitCode: EXIT.INPUT_INVALID,
        hints: ["Example: skillport manage abc123 set-price 9.99"],
      });
      return;
    }

    const dollars = parseFloat(priceArg);
    if (isNaN(dollars) || dollars < 0) {
      outputError("INPUT_INVALID", "Price must be a non-negative number (in dollars).", {
        exitCode: EXIT.INPUT_INVALID,
      });
      return;
    }

    const cents = Math.round(dollars * 100);
    if (cents > 0 && cents < 50) {
      outputError("INPUT_INVALID", "Minimum price for paid skills is $0.50 (50 cents).", {
        exitCode: EXIT.INPUT_INVALID,
      });
      return;
    }
    if (!isJsonMode()) console.log(ACTION_DESC[act]);

    try {
      const res = await fetch(`${config.marketplace_url}/v1/skills/${skillId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${config.auth_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ price: cents }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg = String(body.error || res.statusText);

        if (res.status === 403) {
          outputError("FORBIDDEN", "Permission denied. You are not the author of this skill.", {
            exitCode: EXIT.AUTH_REQUIRED,
          });
        } else if (res.status === 404) {
          outputError("NOT_FOUND", "Server does not support price updates (PATCH /v1/skills/:id returned 404).", {
            exitCode: EXIT.GENERAL,
            hints: ["Are you on an old API deployment? Try updating the server."],
          });
        } else {
          outputError("API_ERROR", `Failed: ${msg}`, {
            exitCode: EXIT.NETWORK,
            retryable: true,
          });
        }
        return;
      }

      const result = await res.json() as { id: string; price: number; status: string };

      logProvenance({
        action: `manage:${act}`,
        agent: detectAgent(),
        skill_id: skillId,
        policy_allowed: true,
      });

      if (isJsonMode()) {
        outputResult({ id: result.id, action: act, result: { price: result.price, status: result.status } });
        return;
      }

      console.log(chalk.green(ACTION_SUCCESS[act]));
      console.log();
      console.log(`  ${chalk.bold("Skill ID:")}  ${result.id}`);
      console.log(`  ${chalk.bold("Price:")}     ${result.price === 0 ? "Free" : `$${(result.price / 100).toFixed(2)}`}`);
      console.log(`  ${chalk.bold("Status:")}    ${result.status}`);
    } catch (error) {
      outputError("NETWORK_ERROR", `Failed: ${(error as Error).message}`, {
        exitCode: EXIT.NETWORK,
        retryable: true,
      });
    }
    return;
  }

  if (!isJsonMode()) console.log(ACTION_DESC[act]);

  try {
    let res: Response;

    if (act === "delete") {
      res = await fetch(`${config.marketplace_url}/v1/skills/${skillId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.auth_token}` },
      });
    } else {
      res = await fetch(`${config.marketplace_url}/v1/skills/${skillId}/${act}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.auth_token}` },
      });
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = String(body.error || res.statusText);

      if (res.status === 403) {
        outputError("FORBIDDEN", "Permission denied. You are not the author of this skill.", {
          exitCode: EXIT.AUTH_REQUIRED,
        });
      } else if (res.status === 404) {
        outputError("NOT_FOUND", `Skill not found: ${skillId}`, {
          exitCode: EXIT.GENERAL,
        });
      } else {
        outputError("API_ERROR", `Failed: ${msg}`, {
          exitCode: EXIT.NETWORK,
          retryable: true,
        });
      }
      return;
    }

    const result = await res.json() as { id: string; status: string };

    logProvenance({
      action: `manage:${act}`,
      agent: detectAgent(),
      skill_id: skillId,
      policy_allowed: true,
    });

    if (isJsonMode()) {
      outputResult({ id: result.id, action: act, result: { status: result.status } });
      return;
    }

    console.log(chalk.green(ACTION_SUCCESS[act]));
    console.log();
    console.log(`  ${chalk.bold("Skill ID:")}  ${result.id}`);
    console.log(`  ${chalk.bold("Status:")}    ${result.status}`);

    if (act === "publish") {
      console.log();
      console.log(chalk.dim(`  URL: ${config.marketplace_web_url}/skills/${result.id}`));
    }
  } catch (error) {
    outputError("NETWORK_ERROR", `Failed: ${(error as Error).message}`, {
      exitCode: EXIT.NETWORK,
      retryable: true,
    });
  }
}

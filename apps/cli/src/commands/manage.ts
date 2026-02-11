import chalk from "chalk";
import { loadConfig } from "../utils/config.js";

type Action = "publish" | "unpublish" | "delete";

const ACTION_DESC: Record<Action, string> = {
  publish: "Publishing skill (draft → published)...",
  unpublish: "Unpublishing skill (published → draft)...",
  delete: "Deleting skill...",
};

const ACTION_SUCCESS: Record<Action, string> = {
  publish: "Skill published! It is now live on the marketplace.",
  unpublish: "Skill unpublished. It is now in draft.",
  delete: "Skill deleted. It is no longer visible on the marketplace.",
};

export async function manageCommand(skillId: string, action: string): Promise<void> {
  const validActions: Action[] = ["publish", "unpublish", "delete"];

  if (!validActions.includes(action as Action)) {
    console.log(chalk.red(`Invalid action: ${action}`));
    console.log(`Valid actions: ${validActions.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();

  if (!config.auth_token) {
    console.log(chalk.red("Not logged in. Run 'skillport login' first."));
    process.exitCode = 1;
    return;
  }

  const act = action as Action;
  console.log(ACTION_DESC[act]);

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
        console.log(chalk.red("Permission denied. You are not the author of this skill."));
      } else if (res.status === 404) {
        console.log(chalk.red(`Skill not found: ${skillId}`));
      } else {
        console.log(chalk.red(`Failed: ${msg}`));
      }

      process.exitCode = 1;
      return;
    }

    const result = await res.json() as { id: string; status: string };

    console.log(chalk.green(ACTION_SUCCESS[act]));
    console.log();
    console.log(`  ${chalk.bold("Skill ID:")}  ${result.id}`);
    console.log(`  ${chalk.bold("Status:")}    ${result.status}`);

    if (act === "publish") {
      console.log();
      console.log(chalk.dim(`  URL: ${config.marketplace_web_url}/skills/${result.id}`));
    }
  } catch (error) {
    console.log(chalk.red(`Failed: ${(error as Error).message}`));
    process.exitCode = 1;
  }
}

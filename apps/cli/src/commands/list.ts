import chalk from "chalk";
import { loadConfig } from "../utils/config.js";

interface MarketplaceSkill {
  id: string;
  ssp_id: string;
  title: string;
  status: string;
  latest_version: string;
  downloads: number;
  avg_rating: number;
  created_at: string;
}

const STATUS_COLORS: Record<string, (s: string) => string> = {
  published: chalk.green,
  draft: chalk.yellow,
  archived: chalk.gray,
  suspended: chalk.red,
  pending_review: chalk.cyan,
};

const STATUS_LABELS: Record<string, string> = {
  published: "published",
  draft: "draft",
  archived: "deleted",
  suspended: "suspended",
  pending_review: "pending",
};

export async function listCommand(opts: { json?: boolean }): Promise<void> {
  const config = loadConfig();

  if (!config.auth_token) {
    console.log(chalk.red("Not logged in. Run 'skillport login' first."));
    process.exitCode = 1;
    return;
  }

  try {
    const res = await fetch(`${config.marketplace_url}/v1/me/skills`, {
      headers: { Authorization: `Bearer ${config.auth_token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      console.log(chalk.red(`Failed to fetch skills: ${body.error || res.statusText}`));
      process.exitCode = 1;
      return;
    }

    const skills: MarketplaceSkill[] = await res.json();

    if (opts.json) {
      console.log(JSON.stringify(skills, null, 2));
      return;
    }

    if (skills.length === 0) {
      console.log(chalk.dim("No skills found. Publish your first skill with:"));
      console.log(chalk.dim("  skillport export ./my-skill -o my-skill.ssp && skillport publish my-skill.ssp"));
      return;
    }

    console.log(chalk.bold(`Your Skills (${skills.length})`));
    console.log();

    // Column widths
    const idWidth = Math.max(4, ...skills.map((s) => s.ssp_id.length));
    const titleWidth = Math.max(5, ...skills.map((s) => s.title.length));
    const statusWidth = 10;
    const versionWidth = 8;
    const dlWidth = 5;

    // Header
    console.log(
      chalk.dim(
        "  " +
        "SSP ID".padEnd(idWidth + 2) +
        "TITLE".padEnd(titleWidth + 2) +
        "STATUS".padEnd(statusWidth + 2) +
        "VERSION".padEnd(versionWidth + 2) +
        "DL".padEnd(dlWidth + 2) +
        "ID"
      )
    );

    for (const skill of skills) {
      const colorFn = STATUS_COLORS[skill.status] || chalk.white;
      const label = STATUS_LABELS[skill.status] || skill.status;

      console.log(
        "  " +
        skill.ssp_id.padEnd(idWidth + 2) +
        skill.title.padEnd(titleWidth + 2) +
        colorFn(label.padEnd(statusWidth + 2)) +
        (skill.latest_version || "—").padEnd(versionWidth + 2) +
        String(skill.downloads || 0).padEnd(dlWidth + 2) +
        chalk.dim(skill.id)
      );
    }

    console.log();
    console.log(chalk.dim("  Manage: skillport manage <skill-id> publish|unpublish|delete"));
  } catch (error) {
    console.log(chalk.red(`Failed to fetch skills: ${(error as Error).message}`));
    process.exitCode = 1;
  }
}

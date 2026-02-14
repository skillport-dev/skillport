import chalk from "chalk";
import {
  isJsonMode,
  outputResult,
  outputError,
  logInfo,
  EXIT,
} from "../utils/output.js";
import { loadConfig, checkAuthReady } from "../utils/config.js";

interface SuggestResult {
  ssp_id: string;
  title: string;
  description: string;
  category: string;
  platform: string;
  risk_score: number;
  avg_rating: number;
  downloads: number;
  price: number;
  latest_version: string;
  install_command: string;
}

interface SuggestResponse {
  data: SuggestResult[];
  query: string;
  keywords: string[];
  total: number;
}

export interface SuggestOptions {
  platform?: string;
  limit?: string;
}

export async function suggestCommand(
  description: string,
  options: SuggestOptions,
): Promise<void> {
  const config = loadConfig();
  const authError = checkAuthReady(config);
  if (authError) {
    outputError("AUTH_REQUIRED", authError, {
      exitCode: EXIT.AUTH_REQUIRED,
      hints: ["Run 'skillport login' to authenticate."],
    });
    return;
  }

  logInfo(`Searching skills for: "${description}"`);

  try {
    const params = new URLSearchParams({ q: description });
    if (options.platform) params.set("platform", options.platform);
    if (options.limit) params.set("limit", options.limit);

    const res = await fetch(
      `${config.marketplace_url}/v1/suggest?${params}`,
      {
        headers: { Authorization: `Bearer ${config.auth_token}` },
      },
    );

    if (!res.ok) {
      outputError("NETWORK_ERROR", `Suggestion request failed: ${res.statusText}`, {
        exitCode: EXIT.NETWORK,
        retryable: true,
      });
      return;
    }

    const result = await res.json() as SuggestResponse;

    if (isJsonMode()) {
      outputResult({
        query: result.query,
        keywords: result.keywords,
        suggestions: result.data.map((s) => ({
          ssp_id: s.ssp_id,
          title: s.title,
          description: s.description,
          category: s.category,
          platform: s.platform,
          risk_score: s.risk_score,
          avg_rating: s.avg_rating,
          downloads: s.downloads,
          price: s.price,
          latest_version: s.latest_version,
          install_command: s.install_command,
        })),
        total: result.total,
      });
      return;
    }

    // Human-readable
    if (result.data.length === 0) {
      console.log(chalk.yellow("\nNo matching skills found."));
      console.log(chalk.dim("  Try a different description or browse the marketplace."));
      return;
    }

    console.log(chalk.bold(`\nSuggested skills for: "${description}"`));
    console.log(chalk.dim(`  Keywords: ${result.keywords.join(", ")}`));
    console.log();

    for (let i = 0; i < result.data.length; i++) {
      const s = result.data[i];
      const price = s.price === 0 ? chalk.green("Free") : `$${(s.price / 100).toFixed(2)}`;
      const rating = s.avg_rating ? `★${s.avg_rating.toFixed(1)}` : "N/A";
      const risk = s.risk_score < 10 ? chalk.green(`${s.risk_score}`)
        : s.risk_score < 25 ? chalk.yellow(`${s.risk_score}`)
        : chalk.red(`${s.risk_score}`);

      console.log(chalk.bold(`  ${i + 1}. ${s.title}`) + chalk.dim(` (${s.ssp_id})`));
      console.log(chalk.dim(`     ${s.description}`));
      console.log(`     ${price} | Risk: ${risk}/100 | ${rating} | ${s.downloads} downloads`);
      console.log(chalk.cyan(`     ${s.install_command}`));
      console.log();
    }
  } catch (err) {
    outputError("NETWORK_ERROR", `Suggestion error: ${(err as Error).message}`, {
      exitCode: EXIT.NETWORK,
      retryable: true,
    });
  }
}

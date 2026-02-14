import chalk from "chalk";
import { loadConfig, checkAuthReady } from "../utils/config.js";
import { isJsonMode, outputResult, outputError, logProgress, EXIT } from "../utils/output.js";

export async function feedbackCommand(
  skillId: string,
  options: {
    status?: string;
    trace?: string;
    comment?: string;
    durationMs?: string;
    tokensUsed?: string;
  },
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

  // Validate status
  const validStatuses = ["success", "failure", "error"];
  if (!options.status || !validStatuses.includes(options.status)) {
    outputError("INPUT_INVALID", `Invalid status: ${options.status || "(missing)"}`, {
      exitCode: EXIT.INPUT_INVALID,
      hints: ["Use --status success, --status failure, or --status error"],
    });
    return;
  }

  // Build feedback payload
  const payload: Record<string, unknown> = {
    status: options.status,
  };

  if (options.trace) payload.trace_id = options.trace;
  if (options.comment) payload.comment = options.comment;
  if (options.durationMs) {
    const ms = parseInt(options.durationMs, 10);
    if (!isNaN(ms) && ms >= 0) payload.duration_ms = ms;
  }
  if (options.tokensUsed) {
    const tokens = parseInt(options.tokensUsed, 10);
    if (!isNaN(tokens) && tokens >= 0) payload.tokens_used = tokens;
  }

  logProgress(`Submitting feedback for ${skillId}...`);

  try {
    // Resolve skill UUID from ssp_id if it contains "/"
    let resolvedId = skillId;
    if (skillId.includes("/")) {
      const searchRes = await fetch(
        `${config.marketplace_url}/v1/skills?q=${encodeURIComponent(skillId)}&per_page=1`,
        { headers: { Authorization: `Bearer ${config.auth_token}` } },
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json() as { data: Array<{ id: string; ssp_id: string }> };
        const match = searchData.data.find((s) => s.ssp_id === skillId);
        if (match) resolvedId = match.id;
      }
    }

    const res = await fetch(`${config.marketplace_url}/v1/skills/${resolvedId}/feedback`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.auth_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = String(body.error || res.statusText);

      if (res.status === 404) {
        outputError("NOT_FOUND", `Skill not found: ${skillId}`, { exitCode: EXIT.GENERAL });
      } else if (res.status === 429) {
        outputError("RATE_LIMITED", msg, {
          exitCode: EXIT.GENERAL,
          retryable: true,
          hints: ["Wait before submitting more feedback."],
        });
      } else {
        outputError("API_ERROR", `Feedback submission failed: ${msg}`, {
          exitCode: EXIT.NETWORK,
          retryable: true,
        });
      }
      return;
    }

    const result = await res.json() as Record<string, unknown>;

    if (isJsonMode()) {
      outputResult(result);
      return;
    }

    console.log(chalk.green("Feedback submitted successfully!"));
    console.log();
    console.log(`  ${chalk.bold("Skill:")}   ${skillId}`);
    console.log(`  ${chalk.bold("Status:")}  ${options.status}`);
    if (options.trace) {
      console.log(`  ${chalk.bold("Trace:")}   ${options.trace}`);
    }
    console.log(chalk.dim("\nThank you — your feedback helps improve skill quality."));
  } catch (error) {
    outputError("NETWORK_ERROR", `Failed: ${(error as Error).message}`, {
      exitCode: EXIT.NETWORK,
      retryable: true,
    });
  }
}

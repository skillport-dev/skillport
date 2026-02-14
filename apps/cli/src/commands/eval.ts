import chalk from "chalk";
import { listTraces } from "../utils/trace.js";
import { isJsonMode, outputResult, outputError, EXIT } from "../utils/output.js";

export async function evalCommand(
  skillId: string,
  options: { runs?: string },
): Promise<void> {
  const maxRuns = options.runs ? parseInt(options.runs, 10) : undefined;

  // Load traces for this skill
  const traces = listTraces(skillId);

  if (traces.length === 0) {
    outputError("NOT_FOUND", `No traces found for skill: ${skillId}`, {
      exitCode: EXIT.INPUT_INVALID,
      hints: [
        "Run the skill with tracing enabled first.",
        "Use 'skillport replay list' to see available traces.",
      ],
    });
    return;
  }

  // Apply --runs limit
  const sample = maxRuns ? traces.slice(0, maxRuns) : traces;

  // Calculate statistics
  const total = sample.length;
  const successes = sample.filter((t) => t.result === "success").length;
  const failures = sample.filter((t) => t.result === "failure").length;
  const errors = sample.filter((t) => t.result === "error").length;
  const successRate = total > 0 ? (successes / total) * 100 : 0;

  const durations = sample.map((t) => t.duration_ms);
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);

  const tokenValues = sample
    .filter((t) => t.tokens_used !== null)
    .map((t) => t.tokens_used!);
  const avgTokens = tokenValues.length > 0
    ? Math.round(tokenValues.reduce((a, b) => a + b, 0) / tokenValues.length)
    : null;

  // Unique agents
  const agents = [...new Set(sample.map((t) => t.agent))];

  // Unique versions
  const versions = [...new Set(sample.map((t) => t.version))];

  if (isJsonMode()) {
    outputResult({
      skill_id: skillId,
      runs: total,
      success_rate: Math.round(successRate * 100) / 100,
      successes,
      failures,
      errors,
      duration: {
        avg_ms: avgDuration,
        min_ms: minDuration,
        max_ms: maxDuration,
        p50_ms: p50,
        p95_ms: p95,
      },
      tokens: {
        avg: avgTokens,
        samples: tokenValues.length,
      },
      agents,
      versions,
    });
    return;
  }

  // Human-readable output
  console.log(chalk.bold(`\nEval: ${skillId}`));
  console.log(chalk.dim("═".repeat(50)));

  console.log(`  ${chalk.bold("Runs:")}          ${total}${maxRuns ? ` (limited from ${traces.length})` : ""}`);
  console.log(`  ${chalk.bold("Versions:")}      ${versions.join(", ")}`);
  console.log(`  ${chalk.bold("Agents:")}        ${agents.join(", ")}`);
  console.log();

  // Success rate bar
  const barLen = 30;
  const filled = Math.round((successRate / 100) * barLen);
  const bar = chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(barLen - filled));
  const rateColor = successRate >= 80 ? chalk.green : successRate >= 50 ? chalk.yellow : chalk.red;
  console.log(`  ${chalk.bold("Success Rate:")}  ${bar} ${rateColor(`${successRate.toFixed(1)}%`)}`);
  console.log(`                 ${chalk.green(`${successes} passed`)} / ${chalk.red(`${failures} failed`)} / ${chalk.yellow(`${errors} errors`)}`);
  console.log();

  // Duration stats
  console.log(`  ${chalk.bold("Duration:")}`);
  console.log(`    avg: ${avgDuration}ms | min: ${minDuration}ms | max: ${maxDuration}ms`);
  console.log(`    p50: ${p50}ms | p95: ${p95}ms`);
  console.log();

  // Token stats
  if (avgTokens !== null) {
    console.log(`  ${chalk.bold("Tokens:")}        avg ${avgTokens} (${tokenValues.length} samples)`);
  } else {
    console.log(`  ${chalk.bold("Tokens:")}        ${chalk.dim("no data")}`);
  }

  console.log(chalk.dim("\n═".repeat(50)));
  console.log(chalk.dim("Submit feedback: skillport feedback " + skillId + " --status success"));
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

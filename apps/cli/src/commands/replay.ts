import chalk from "chalk";
import { loadTrace, listTraces } from "../utils/trace.js";
import { isJsonMode, outputResult, outputError, EXIT } from "../utils/output.js";

export async function replayCommand(
  traceRef: string,
  _options: Record<string, unknown>,
): Promise<void> {
  // Special case: "list" shows all traces
  if (traceRef === "list") {
    const traces = listTraces();

    if (isJsonMode()) {
      outputResult({
        traces: traces.map((t) => ({
          trace_id: t.trace_id,
          skill_id: t.skill_id,
          version: t.version,
          result: t.result,
          duration_ms: t.duration_ms,
          started_at: t.started_at,
        })),
        total: traces.length,
      });
      return;
    }

    if (traces.length === 0) {
      console.log(chalk.dim("No traces found."));
      console.log(chalk.dim("Traces are saved when skills are executed with tracing enabled."));
      return;
    }

    console.log(chalk.bold(`Traces (${traces.length}):\n`));
    for (const t of traces) {
      const icon = t.result === "success" ? chalk.green("✓")
        : t.result === "failure" ? chalk.red("✗")
        : chalk.yellow("!");
      const date = new Date(t.started_at).toLocaleString();
      console.log(`  ${icon} ${t.skill_id}@${t.version} — ${t.result} (${t.duration_ms}ms) ${chalk.dim(date)}`);
      console.log(chalk.dim(`    ID: ${t.trace_id}`));
    }
    return;
  }

  // Load specific trace
  const trace = loadTrace(traceRef);

  if (!trace) {
    outputError("NOT_FOUND", `Trace not found: ${traceRef}`, {
      exitCode: EXIT.INPUT_INVALID,
      hints: [
        "Use a trace ID or filename.",
        "Run 'skillport replay list' to see available traces.",
      ],
    });
    return;
  }

  if (isJsonMode()) {
    outputResult(trace as unknown as Record<string, unknown>);
    return;
  }

  // Human-readable trace display
  const resultIcon = trace.result === "success" ? chalk.green("✓ SUCCESS")
    : trace.result === "failure" ? chalk.red("✗ FAILURE")
    : chalk.yellow("! ERROR");

  console.log(chalk.bold(`\nTrace: ${trace.skill_id}@${trace.version}`));
  console.log(chalk.dim("─".repeat(50)));
  console.log(`  ${chalk.bold("Trace ID:")}    ${trace.trace_id}`);
  console.log(`  ${chalk.bold("Agent:")}       ${trace.agent}`);
  console.log(`  ${chalk.bold("Result:")}      ${resultIcon}`);
  console.log(`  ${chalk.bold("Duration:")}    ${trace.duration_ms}ms`);
  console.log(`  ${chalk.bold("Started:")}     ${new Date(trace.started_at).toLocaleString()}`);
  console.log(`  ${chalk.bold("Completed:")}   ${new Date(trace.completed_at).toLocaleString()}`);

  if (trace.tokens_used !== null) {
    console.log(`  ${chalk.bold("Tokens:")}      ${trace.tokens_used}`);
  }

  if (trace.error) {
    console.log(`  ${chalk.bold("Error:")}       ${chalk.red(trace.error)}`);
  }

  if (Object.keys(trace.input).length > 0) {
    console.log(`\n  ${chalk.bold("Input:")}`);
    for (const [key, value] of Object.entries(trace.input)) {
      console.log(`    ${key}: ${chalk.dim(String(value))}`);
    }
  }

  if (trace.files_modified.length > 0) {
    console.log(`\n  ${chalk.bold("Files Modified:")} (${trace.files_modified.length})`);
    for (const file of trace.files_modified) {
      console.log(`    ${chalk.dim(file)}`);
    }
  }

  console.log(chalk.dim("\n─".repeat(50)));
  console.log(chalk.dim("To submit feedback: skillport feedback " + trace.skill_id + " --status " + trace.result + " --trace " + trace.trace_id));
}

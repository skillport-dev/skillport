#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { scanCommand } from "./commands/scan.js";
import { exportCommand } from "./commands/export.js";
import { signCommand } from "./commands/sign.js";
import { verifyCommand } from "./commands/verify.js";
import { installCommand } from "./commands/install.js";
import { dryRunCommand } from "./commands/dry-run.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { loginCommand } from "./commands/login.js";
import { publishCommand } from "./commands/publish.js";
import { whoamiCommand } from "./commands/whoami.js";
import { doctorCommand } from "./commands/doctor.js";
import { keysRegisterCommand } from "./commands/keys-register.js";
import { listCommand } from "./commands/list.js";
import { manageCommand } from "./commands/manage.js";
import { convertCommand } from "./commands/convert.js";
import { planCommand } from "./commands/plan.js";
import { inspectCommand } from "./commands/inspect.js";
import { suggestCommand } from "./commands/suggest.js";
import { replayCommand } from "./commands/replay.js";
import { evalCommand } from "./commands/eval.js";
import { feedbackCommand } from "./commands/feedback.js";

const program = new Command();

program
  .name("skillport")
  .description("SkillPort — secure skill distribution for OpenClaw & Claude Code")
  .version("1.2.0");

program
  .command("init")
  .description("Generate Ed25519 key pair for signing")
  .option("--json", "Output as JSON")
  .action(initCommand);

program
  .command("scan <path>")
  .description("Run security scan on a skill directory or .ssp file")
  .option("--json", "Output as JSON")
  .action(scanCommand);

program
  .command("export <path>")
  .description("Export a skill directory as a SkillPort package (.ssp)")
  .option("-o, --output <file>", "Output file path")
  .option("-y, --yes", "Non-interactive mode (include all, skip prompts)")
  .option("--id <id>", "Skill ID (author-slug/skill-slug)")
  .option("--name <name>", "Skill name")
  .option("--description <desc>", "Skill description")
  .option("--skill-version <ver>", "Skill version (semver)")
  .option("--author <name>", "Author name")
  .option("--openclaw-compat <range>", "OpenClaw compatibility range")
  .option("--os <os...>", "Compatible OS (macos, linux, windows)")
  .option("--json", "Output as JSON")
  .action(exportCommand);

program
  .command("sign <ssp>")
  .description("Sign or re-sign a SkillPort package")
  .option("--json", "Output as JSON")
  .action(signCommand);

program
  .command("verify <ssp>")
  .description("Verify SkillPort package signatures and checksums")
  .option("--public-key <path>", "Path to author public key for verification")
  .option("--json", "Output as JSON")
  .action(verifyCommand);

program
  .command("install <target>")
  .description("Install a SkillPort package")
  .option("--accept-risk", "Accept high-risk permissions (shell, critical flags)")
  .option("-y, --yes", "Non-interactive mode (auto-approve, use defaults)")
  .option("--project", "Install to project-local .claude/skills/ (Claude Code only)")
  .option("--global", "Install to user-global directory (default for both platforms)")
  .option("--force", "Force reinstall even if same version is already installed")
  .option("--no-integrate", "Skip CLAUDE.md auto-integration")
  .option("--json", "Output as JSON")
  .action(installCommand);

program
  .command("convert <source>")
  .description("Convert a skill between OpenClaw and Claude Code formats")
  .requiredOption("--to <platform>", "Target platform (openclaw | claude-code | universal)")
  .option("-o, --output <path>", "Output directory path")
  .option("--preserve-meta", "Preserve platform-specific metadata as comments", true)
  .option("--no-preserve-meta", "Strip platform-specific metadata")
  .option("--infer-tools", "Infer allowed-tools from body content (CC conversion)", false)
  .option("--dry-run", "Preview conversion without writing files", false)
  .option("-y, --yes", "Non-interactive mode")
  .option("--json", "Output as JSON")
  .action(convertCommand);

program
  .command("plan <target>")
  .description("Preview install changes without applying (Plan → Apply workflow)")
  .option("--project", "Plan for project-local install (Claude Code only)")
  .option("--global", "Plan for user-global install")
  .option("--json", "Output as JSON")
  .action(planCommand);

program
  .command("inspect <target>")
  .description("Inspect a SkillPort package — metadata, security, inputs/outputs")
  .option("--json", "Output as JSON")
  .action(inspectCommand);

program
  .command("dry-run <ssp>")
  .description("Run installation diagnostics without installing")
  .option("--json", "Output as JSON")
  .action(dryRunCommand);

program
  .command("uninstall <id>")
  .description("Uninstall an installed skill")
  .option("-y, --yes", "Non-interactive mode (auto-confirm)")
  .option("--json", "Output as JSON")
  .action(uninstallCommand);

program
  .command("login")
  .description("Authenticate with SkillPort Market")
  .option("--method <method>", "Login method: browser or token", "browser")
  .option("--token <token>", "API token (for --method token)")
  .option("-y, --yes", "Non-interactive mode (skip prompts)")
  .option("--no-browser", "Print auth URL instead of opening browser")
  .option("--port <port>", "Callback port (default: 9876, use 0 for auto)")
  .option("--host <host>", "Callback host (default: 127.0.0.1)")
  .option("--json", "Output as JSON")
  .action(loginCommand);

program
  .command("publish <ssp>")
  .description("Publish a SkillPort package to the marketplace")
  .option("--json", "Output as JSON")
  .action(publishCommand);

program
  .command("list")
  .description("List your marketplace skills and their status")
  .option("--json", "Output as JSON")
  .action(listCommand);

program
  .command("manage <skill-id> <action> [args...]")
  .description("Manage a skill: publish, unpublish, delete, or set-price")
  .option("--json", "Output as JSON")
  .action(manageCommand);

program
  .command("suggest <description>")
  .description("Get skill recommendations for a task description")
  .option("--platform <platform>", "Filter by platform (openclaw, claude-code, universal, all)")
  .option("--limit <n>", "Max results (default: 5, max: 20)")
  .option("--json", "Output as JSON")
  .action(suggestCommand);

program
  .command("replay <trace>")
  .description("View an execution trace, or 'replay list' to list all traces")
  .option("--json", "Output as JSON")
  .action(replayCommand);

program
  .command("eval <skill-id>")
  .description("Evaluate skill quality from execution traces")
  .option("--runs <n>", "Limit to N most recent traces")
  .option("--json", "Output as JSON")
  .action(evalCommand);

program
  .command("feedback <skill-id>")
  .description("Submit execution feedback to the marketplace")
  .requiredOption("--status <status>", "Execution result: success, failure, or error")
  .option("--trace <trace-id>", "Associated trace ID")
  .option("--comment <text>", "Optional comment")
  .option("--duration-ms <ms>", "Execution duration in milliseconds")
  .option("--tokens-used <n>", "Tokens consumed")
  .option("--json", "Output as JSON")
  .action(feedbackCommand);

program
  .command("whoami")
  .description("Show current configuration and identity")
  .option("--json", "Output as JSON")
  .action(whoamiCommand);

program
  .command("doctor")
  .description("Check connectivity and setup health")
  .option("--json", "Output as JSON")
  .action(doctorCommand);

const keys = program
  .command("keys")
  .description("Manage signing keys");

keys
  .command("register")
  .description("Register your public signing key with the marketplace")
  .option("--json", "Output as JSON")
  .action(keysRegisterCommand);

program.parse();

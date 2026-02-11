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

const program = new Command();

program
  .name("skillport")
  .description("SkillPort — open-source secure skill distribution for OpenClaw")
  .version("1.0.0");

program
  .command("init")
  .description("Generate Ed25519 key pair for signing")
  .action(initCommand);

program
  .command("scan <path>")
  .description("Run security scan on a skill directory or .ssp file")
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
  .action(exportCommand);

program
  .command("sign <ssp>")
  .description("Sign or re-sign a SkillPort package")
  .action(signCommand);

program
  .command("verify <ssp>")
  .description("Verify SkillPort package signatures and checksums")
  .option("--public-key <path>", "Path to author public key for verification")
  .action(verifyCommand);

program
  .command("install <target>")
  .description("Install a SkillPort package")
  .option("--accept-risk", "Accept high-risk permissions (shell, critical flags)")
  .option("-y, --yes", "Non-interactive mode (auto-approve, use defaults)")
  .action(installCommand);

program
  .command("dry-run <ssp>")
  .description("Run installation diagnostics without installing")
  .action(dryRunCommand);

program
  .command("uninstall <id>")
  .description("Uninstall an installed skill")
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
  .action(loginCommand);

program
  .command("publish <ssp>")
  .description("Publish a SkillPort package to the marketplace")
  .action(publishCommand);

program
  .command("list")
  .description("List your marketplace skills and their status")
  .option("--json", "Output as JSON")
  .action(listCommand);

program
  .command("manage <skill-id> <action>")
  .description("Manage a skill: publish, unpublish, or delete")
  .action(manageCommand);

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
  .action(keysRegisterCommand);

program.parse();

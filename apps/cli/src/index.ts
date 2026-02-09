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

const program = new Command();

program
  .name("skillport")
  .description("SkillPort — secure skill distribution for OpenClaw")
  .version("0.1.0");

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
  .action(loginCommand);

program
  .command("publish <ssp>")
  .description("Publish a SkillPort package to the marketplace")
  .action(publishCommand);

program.parse();

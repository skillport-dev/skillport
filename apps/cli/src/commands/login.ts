import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import chalk from "chalk";
import inquirer from "inquirer";
import { loadConfig, saveConfig, hasKeys, loadPublicKey } from "../utils/config.js";

export async function loginCommand(): Promise<void> {
  const config = loadConfig();

  console.log(chalk.bold("SkillPort Market Login"));
  console.log(chalk.dim(`Marketplace: ${config.marketplace_url}`));
  console.log();

  const { method } = await inquirer.prompt([
    {
      type: "list",
      name: "method",
      message: "Login method:",
      choices: [
        { name: "Browser (GitHub OAuth)", value: "browser" },
        { name: "Paste API token", value: "token" },
      ],
    },
  ]);

  if (method === "token") {
    const { token } = await inquirer.prompt([
      { type: "password", name: "token", message: "Enter your API token:" },
    ]);
    config.auth_token = token;
    saveConfig(config);
    console.log(chalk.green("Login successful! Token saved."));
    return;
  }

  // Browser OAuth flow
  const state = randomBytes(16).toString("hex");
  const port = 9876;

  // Open browser to Supabase auth
  const authUrl = `${config.marketplace_url}/auth/cli?state=${state}&port=${port}`;
  console.log(chalk.dim(`Opening browser to: ${authUrl}`));
  console.log(chalk.dim("Waiting for authentication..."));

  const { exec } = await import("node:child_process");
  const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${openCmd} "${authUrl}"`);

  // Start local server to receive callback
  const token = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out (60s)"));
    }, 60_000);

    const server = createServer(async (req, res) => {
      const url = new URL(req.url || "", `http://localhost:${port}`);

      if (url.pathname === "/callback") {
        const callbackState = url.searchParams.get("state");
        const accessToken = url.searchParams.get("token");

        if (callbackState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h1>State mismatch. Please try again.</h1>");
          return;
        }

        if (!accessToken) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h1>No token received. Please try again.</h1>");
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Logged in to SkillPort! You can close this window.</h1>");

        clearTimeout(timeout);
        server.close();
        resolve(accessToken);
      }
    });

    server.listen(port);
  });

  // Exchange for CLI token
  try {
    const response = await fetch(`${config.marketplace_url}/v1/auth/cli-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ label: "cli", scopes: ["read", "write", "publish"] }),
    });

    if (response.ok) {
      const data = await response.json() as { token: string };
      config.auth_token = data.token;
    } else {
      // Use the access token directly as fallback
      config.auth_token = token;
    }
  } catch {
    // If API not available, use the token directly
    config.auth_token = token;
  }

  saveConfig(config);

  // Auto-register public key if available
  if (hasKeys()) {
    try {
      const publicKey = loadPublicKey();
      await fetch(`${config.marketplace_url}/v1/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.auth_token}`,
        },
        body: JSON.stringify({ public_key_pem: publicKey, label: "default" }),
      });
      console.log(chalk.dim("  Public key registered with marketplace."));
    } catch {
      // Non-critical
    }
  }

  console.log(chalk.green("Login successful! Token saved."));
}

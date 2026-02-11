import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import chalk from "chalk";
import inquirer from "inquirer";
import { loadConfig, saveConfig, hasKeys, loadPublicKey } from "../utils/config.js";

interface LoginOptions {
  method: string;
  token?: string;
  yes?: boolean;
  browser?: boolean; // Commander negates --no-browser to browser=false
  port?: string;
}

function listenOnPort(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.removeListener("error", reject);
      const addr = server.address() as AddressInfo;
      resolve(addr.port);
    });
  });
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const config = loadConfig();

  console.log(chalk.bold("SkillPort Market Login"));
  console.log(chalk.dim(`Marketplace: ${config.marketplace_web_url}`));
  console.log();

  let method = options.method;

  // If --token is provided, force token method
  if (options.token) {
    method = "token";
  }

  // Interactive prompt only when no flags given
  if (!options.yes && method === "browser" && !options.token) {
    const answer = await inquirer.prompt([
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
    method = answer.method;
  }

  if (method === "token") {
    let token = options.token;
    if (!token) {
      const answer = await inquirer.prompt([
        { type: "password", name: "token", message: "Enter your API token:" },
      ]);
      token = answer.token;
    }
    config.auth_token = token;
    saveConfig(config);
    console.log(chalk.green("Login successful! Token saved."));
    return;
  }

  // Browser OAuth flow
  const state = randomBytes(16).toString("hex");
  const requestedPort = options.port !== undefined ? parseInt(options.port, 10) : 9876;
  const userExplicitPort = options.port !== undefined;

  // Create server and bind to port
  const server = createServer();
  let actualPort: number;

  try {
    actualPort = await listenOnPort(server, requestedPort);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "EADDRINUSE" && !userExplicitPort) {
      // Retry with OS-assigned free port
      console.log(chalk.yellow(`Port ${requestedPort} in use, selecting a free port...`));
      actualPort = await listenOnPort(server, 0);
    } else {
      throw err;
    }
  }

  const authUrl = `${config.marketplace_web_url}/auth/cli?state=${state}&port=${actualPort}`;

  if (options.browser === false) {
    // --no-browser: print URL only
    console.log(chalk.bold("Open this URL in your browser to authenticate:"));
    console.log();
    console.log(`  ${authUrl}`);
    console.log();
    console.log(chalk.dim("Waiting for authentication callback..."));
  } else {
    console.log(chalk.dim(`Opening browser to: ${authUrl}`));
    console.log(chalk.dim("Waiting for authentication..."));

    const { exec } = await import("node:child_process");
    const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    exec(`${openCmd} "${authUrl}"`);
  }

  // Wait for callback
  const token = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out (60s). Try again or use: skillport login --method token --token <your-token>"));
    }, 60_000);

    server.on("request", (req, res) => {
      const url = new URL(req.url || "", `http://localhost:${actualPort}`);

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

import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import chalk from "chalk";
import inquirer from "inquirer";
import { loadConfig, saveConfig, validateApiUrl } from "../utils/config.js";
import { registerPublicKey } from "../utils/register-key.js";
import { isJsonMode, outputResult, outputError, EXIT } from "../utils/output.js";

interface LoginOptions {
  method: string;
  token?: string;
  yes?: boolean;
  browser?: boolean; // Commander negates --no-browser to browser=false
  port?: string;
  host?: string;
}

const ALLOWED_HOSTS = ["127.0.0.1", "localhost", "::1"];
const DEFAULT_HOST = "127.0.0.1";

function listenOnPort(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      const addr = server.address() as AddressInfo;
      resolve(addr.port);
    });
  });
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const config = loadConfig();

  // Validate API URL before proceeding
  const urlError = validateApiUrl(config.marketplace_url);
  if (urlError) {
    outputError("INPUT_INVALID", urlError, {
      exitCode: EXIT.INPUT_INVALID,
    });
    return;
  }

  if (!isJsonMode()) {
    console.log(chalk.bold("SkillPort Market Login"));
    console.log(chalk.dim(`Marketplace: ${config.marketplace_web_url}`));
    console.log();
  }

  let method = options.method;

  // If --token is provided, force token method
  if (options.token) {
    method = "token";
  }

  // Interactive prompt only when no flags given
  if (!options.yes && !isJsonMode() && method === "browser" && !options.token) {
    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "method",
        message: "Login method:",
        choices: [
          { name: "Paste CLI token (recommended)", value: "token" },
          { name: "Browser (GitHub OAuth)", value: "browser" },
        ],
      },
    ]);
    method = answer.method;
  }

  if (method === "token") {
    let token = options.token;
    if (!token && (options.yes || isJsonMode())) {
      outputError("INPUT_INVALID", "--token is required in non-interactive mode.", {
        exitCode: EXIT.INPUT_INVALID,
        hints: ["Get your token at: https://skillport.market/auth/cli-token"],
      });
      return;
    }
    if (!token) {
      console.log(chalk.dim("Get your token at: https://skillport.market/auth/cli-token"));
      console.log();
      const answer = await inquirer.prompt([
        { type: "password", name: "token", message: "Enter your CLI token:" },
      ]);
      token = answer.token;
    }
    config.auth_token = token;
    config.auth_token_expires_at = new Date(Date.now() + 90 * 24 * 3600_000).toISOString();
    saveConfig(config);

    // Auto-register public key if available
    await registerPublicKey(config);

    if (isJsonMode()) {
      outputResult({ authenticated: true, method: "token" });
      return;
    }

    console.log(chalk.green("Login successful! Token saved."));
    return;
  }

  // Browser OAuth flow
  const state = randomBytes(16).toString("hex");
  const requestedPort = options.port !== undefined ? parseInt(options.port, 10) : 9876;
  const userExplicitPort = options.port !== undefined;
  const bindHost = options.host || DEFAULT_HOST;

  // Create server and bind to host:port
  const server = createServer();
  let actualPort: number;

  try {
    actualPort = await listenOnPort(server, requestedPort, bindHost);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "EADDRINUSE" && !userExplicitPort) {
      // Retry with OS-assigned free port
      if (!isJsonMode()) {
        console.log(chalk.yellow(`Port ${requestedPort} in use, selecting a free port...`));
      }
      actualPort = await listenOnPort(server, 0, bindHost);
    } else {
      throw err;
    }
  }

  // Use the bind host for the callback URL sent to the web app
  const callbackHost = bindHost === "::1" ? "[::1]" : bindHost;
  const authUrl = `${config.marketplace_web_url}/auth/cli?state=${state}&port=${actualPort}&host=${encodeURIComponent(callbackHost)}`;

  if (options.browser === false) {
    // --no-browser: print URL only
    if (!isJsonMode()) {
      console.log(chalk.bold("Open this URL in your browser to authenticate:"));
      console.log();
      console.log(`  ${authUrl}`);
      console.log();
      console.log(chalk.dim(`Listening on ${callbackHost}:${actualPort}`));
      console.log(chalk.dim("Waiting for authentication callback..."));
    }
  } else {
    if (!isJsonMode()) {
      console.log(chalk.dim(`Opening browser to: ${authUrl}`));
      console.log(chalk.dim(`Listening on ${callbackHost}:${actualPort}`));
      console.log(chalk.dim("Waiting for authentication..."));
    }

    const { exec } = await import("node:child_process");
    const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    exec(`${openCmd} "${authUrl}"`);
  }

  // Wait for callback
  const token = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error(
        `Authentication timed out (60s).\n` +
        `  Listened on: ${callbackHost}:${actualPort}\n` +
        `  Self-test:   curl http://${callbackHost}:${actualPort}/callback?state=test\\&token=test\n` +
        `  Retry:       skillport login --yes --no-browser --port 0 --host 127.0.0.1\n` +
        `  Or use:      skillport login --method token --token <your-token>`,
      ));
    }, 60_000);

    server.on("request", (req, res) => {
      const url = new URL(req.url || "", `http://${callbackHost}:${actualPort}`);

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
      const data = await response.json() as { token: string; expires_at?: string };
      config.auth_token = data.token;
      config.auth_token_expires_at = data.expires_at || new Date(Date.now() + 90 * 24 * 3600_000).toISOString();
    } else {
      // Use the access token directly as fallback
      config.auth_token = token;
      config.auth_token_expires_at = new Date(Date.now() + 90 * 24 * 3600_000).toISOString();
    }
  } catch {
    // If API not available, use the token directly
    config.auth_token = token;
    config.auth_token_expires_at = new Date(Date.now() + 90 * 24 * 3600_000).toISOString();
  }

  saveConfig(config);

  // Auto-register public key if available
  await registerPublicKey(config);

  if (isJsonMode()) {
    outputResult({ authenticated: true, method: "browser" });
    return;
  }

  console.log(chalk.green("Login successful! Token saved."));
}

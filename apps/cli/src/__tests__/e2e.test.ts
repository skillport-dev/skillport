import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * E2E test: init → export → verify → dry-run → install
 *
 * Runs the CLI via `node dist/index.js` with a temp HOME
 * so all side effects (keys, config, installed skills) are isolated.
 */
describe("CLI E2E: export → verify → dry-run → install", () => {
  let tempHome: string;
  let sspPath: string;
  let skillsDir: string;
  const cliDir = join(__dirname, "..", "..");
  const cli = `node "${join(cliDir, "dist", "index.js")}"`;
  const fixture = join(cliDir, "test-fixtures", "sample-skill");

  function run(cmd: string, extraEnv: Record<string, string> = {}, timeout = 30_000): string {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        HOME: tempHome,
        OPENCLAW_SKILLS_DIR: skillsDir,
        ...extraEnv,
      },
      timeout,
    });
  }

  /** Run command and return both stdout + stderr merged */
  function runAll(cmd: string, extraEnv: Record<string, string> = {}, timeout = 30_000): string {
    try {
      const stdout = execSync(cmd, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          HOME: tempHome,
          OPENCLAW_SKILLS_DIR: skillsDir,
          ...extraEnv,
        },
        timeout,
      });
      return stdout;
    } catch (e: unknown) {
      const ex = e as { stdout?: string; stderr?: string };
      return (ex.stdout || "") + (ex.stderr || "");
    }
  }

  beforeAll(() => {
    tempHome = mkdtempSync(join(tmpdir(), "skillport-e2e-"));
    sspPath = join(tempHome, "test-output.ssp");
    skillsDir = join(tempHome, ".openclaw", "skills");
  });

  afterAll(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("init generates keys", () => {
    const out = run(`${cli} init`);
    expect(out).toContain("Key pair generated");
    expect(existsSync(join(tempHome, ".skillport", "keys", "default.pub"))).toBe(true);
    expect(existsSync(join(tempHome, ".skillport", "keys", "default.key"))).toBe(true);
  });

  it("export creates .ssp in non-interactive mode", () => {
    const out = runAll(
      `${cli} export "${fixture}" -o "${sspPath}" --yes` +
      ` --id yu/sample-skill --name "Sample Skill"` +
      ` --description "A sample skill" --skill-version 1.0.0` +
      ` --author Yu --openclaw-compat ">=1.0.0"` +
      ` --os macos --os linux --os windows`,
    );
    expect(out).toContain("SkillPort package created");
    expect(existsSync(sspPath)).toBe(true);
  });

  it("verify passes on exported .ssp", () => {
    const pubKey = join(tempHome, ".skillport", "keys", "default.pub");
    const out = run(`${cli} verify "${sspPath}" --public-key "${pubKey}"`);
    expect(out).toContain("Author signature: VALID");
    expect(out).toContain("Checksums: ALL VALID");
    expect(out).toContain("Verification PASSED");
  });

  it("dry-run passes", () => {
    const out = run(`${cli} dry-run "${sspPath}"`);
    expect(out).toContain("ALL CHECKS PASSED");
  });

  it("login --method token --token saves token and attempts key registration", () => {
    const out = run(`${cli} login --method token --token test-token-123`);
    expect(out).toContain("Login successful! Token saved.");
    // Key registration is attempted (will warn since API isn't reachable, but shouldn't fail login)
    expect(out).toMatch(/Public key registered|Warning: Could not/);

    const configFile = join(tempHome, ".skillport", "config.json");
    expect(existsSync(configFile)).toBe(true);
    const config = JSON.parse(readFileSync(configFile, "utf-8"));
    expect(config.auth_token).toBe("test-token-123");
  });

  it("keys register requires login", () => {
    // Use a fresh HOME with no config/keys to test error
    const freshHome = mkdtempSync(join(tmpdir(), "skillport-keys-"));
    try {
      execSync(`${cli} keys register`, {
        encoding: "utf-8",
        env: { ...process.env, HOME: freshHome },
      });
      // Should have thrown due to non-zero exit
      expect.unreachable("Should have exited with non-zero code");
    } catch (e: unknown) {
      // outputError sends to stderr, execSync includes stderr in error.message
      const ex = e as { stdout?: string; stderr?: string; message?: string };
      const msg = (ex.stderr || "") + (ex.stdout || "") + (ex.message || "");
      expect(msg).toContain("Not logged in");
    } finally {
      rmSync(freshHome, { recursive: true, force: true });
    }
  });

  it("keys register runs after init + login (warns when API unavailable)", () => {
    // Keys exist from earlier init, token exists from earlier login
    // API is not running, so registration will warn and exit non-zero
    try {
      const out = run(`${cli} keys register`);
      expect(out).toMatch(/Public key registered|Warning: Could not/);
    } catch (e: unknown) {
      const msg = (e as { stdout?: string }).stdout || (e as Error).message || "";
      expect(msg).toMatch(/Public key registered|Warning: Could not/);
    }
  });

  it("login --yes --no-browser --port 0 prints URL with host and binds to 127.0.0.1", () => {
    let caught = false;
    try {
      run(`${cli} login --yes --no-browser --port 0`, {}, 3_000);
    } catch (e: unknown) {
      caught = true;
      const msg = (e as { stdout?: string }).stdout || (e as Error).message || "";
      expect(msg).toContain("Open this URL in your browser to authenticate:");
      expect(msg).not.toContain("Login method:");
      // Auth URL must point to web domain, not API domain
      expect(msg).toContain("https://skillport.market/auth/cli?");
      expect(msg).not.toContain("api.skillport.market/auth/cli");
      // Must include host param for the web callback
      expect(msg).toContain("host=127.0.0.1");
      // Must show what it's listening on
      expect(msg).toContain("Listening on 127.0.0.1:");
    }
    expect(caught).toBe(true);
  }, 10_000);

  it("login retries on EADDRINUSE when port not explicitly set", async () => {
    // Occupy port 9876 on 127.0.0.1, then run login without --port flag.
    // The CLI should detect EADDRINUSE and retry on a free port.
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(9876, "127.0.0.1", resolve));
    try {
      let caught = false;
      try {
        run(`${cli} login --yes --no-browser`, {}, 3_000);
      } catch (e: unknown) {
        caught = true;
        const msg = (e as { stdout?: string }).stdout || (e as Error).message || "";
        expect(msg).toContain("Port 9876 in use, selecting a free port...");
        expect(msg).toContain("Open this URL in your browser to authenticate:");
      }
      expect(caught).toBe(true);
    } finally {
      blocker.close();
    }
  }, 10_000);

  it("whoami shows config and key info", () => {
    const out = run(`${cli} whoami`);
    expect(out).toContain("SkillPort CLI");
    expect(out).toContain("Authenticated:");
    expect(out).toContain("Signing keys:");
  });

  it("whoami --json returns valid JSON with envelope", () => {
    const out = run(`${cli} whoami --json`);
    const envelope = JSON.parse(out);
    expect(envelope).toHaveProperty("schema_version", 1);
    expect(envelope).toHaveProperty("ok", true);
    expect(envelope).toHaveProperty("data");
    const data = envelope.data;
    expect(data).toHaveProperty("config_path");
    expect(data).toHaveProperty("authenticated");
    expect(data).toHaveProperty("keys_exist");
    expect(data).toHaveProperty("marketplace_url");
    expect(data.keys_exist).toBe(true);
    expect(typeof data.local_key_id).toBe("string");
  });

  it("doctor checks setup health", () => {
    const out = run(`${cli} doctor --json`, {}, 15_000);
    const envelope = JSON.parse(out);
    expect(envelope).toHaveProperty("schema_version", 1);
    expect(envelope).toHaveProperty("ok", true);
    const data = envelope.data;
    expect(data).toHaveProperty("checks");
    expect(data).toHaveProperty("ok");
    expect(Array.isArray(data.checks)).toBe(true);
    // config, auth, keys should always exist
    const names = data.checks.map((c: { name: string }) => c.name);
    expect(names).toContain("config");
    expect(names).toContain("auth");
    expect(names).toContain("keys");
  }, 20_000);

  it("install succeeds in non-interactive mode", () => {
    const out = runAll(`${cli} install "${sspPath}" --yes`);
    expect(out).toContain("Installed: Sample Skill v1.0.0");

    // Verify files were extracted
    const installDir = join(skillsDir, "yu", "sample-skill");
    expect(existsSync(join(installDir, "SKILL.md"))).toBe(true);
    expect(existsSync(join(installDir, "manifest.json"))).toBe(true);

    // Verify manifest content
    const manifest = JSON.parse(readFileSync(join(installDir, "manifest.json"), "utf-8"));
    expect(manifest.id).toBe("yu/sample-skill");
    expect(manifest.version).toBe("1.0.0");
  });

  it("install is idempotent (skips if same version installed)", () => {
    // Re-install the same version — should skip
    const out = runAll(`${cli} install "${sspPath}" --yes`);
    expect(out).toContain("Already installed");
  });

  it("install --force reinstalls same version", () => {
    const out = runAll(`${cli} install "${sspPath}" --yes --force`);
    expect(out).toContain("Installed: Sample Skill v1.0.0");
  });

  it("plan outputs structured preview", () => {
    const out = run(`${cli} plan "${sspPath}" --json`);
    const envelope = JSON.parse(out);
    expect(envelope).toHaveProperty("schema_version", 1);
    expect(envelope).toHaveProperty("ok", true);
    const data = envelope.data;
    expect(data.skill_id).toBe("yu/sample-skill");
    expect(data.version).toBe("1.0.0");
    expect(data.action).toBe("reinstall");
    expect(data.security).toHaveProperty("scan_passed");
    expect(data.security).toHaveProperty("risk_score");
    expect(data.environment).toHaveProperty("os_compatible", true);
    expect(data.rollback).toHaveProperty("command");
  });

  it("export --json outputs structured result", () => {
    const jsonSspPath = join(tempHome, "json-output.ssp");
    const out = run(
      `${cli} export "${join(cliDir, "test-fixtures", "sample-skill")}" -o "${jsonSspPath}" --yes --json` +
      ` --id yu/json-test --name "JSON Test"` +
      ` --description "Test" --skill-version 1.0.0` +
      ` --author Yu --os macos`,
    );
    const envelope = JSON.parse(out);
    expect(envelope).toHaveProperty("schema_version", 1);
    expect(envelope).toHaveProperty("ok", true);
    expect(envelope.data).toHaveProperty("output_path");
    expect(envelope.data).toHaveProperty("size_bytes");
    expect(envelope.data).toHaveProperty("manifest_id", "yu/json-test");
  });
});

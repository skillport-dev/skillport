import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
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

  function run(cmd: string, extraEnv: Record<string, string> = {}): string {
    return execSync(cmd, {
      encoding: "utf-8",
      env: {
        ...process.env,
        HOME: tempHome,
        OPENCLAW_SKILLS_DIR: skillsDir,
        ...extraEnv,
      },
      timeout: 30_000,
    });
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
    const out = run(
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

  it("install succeeds in non-interactive mode", () => {
    const out = run(`${cli} install "${sspPath}" --yes`);
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
});

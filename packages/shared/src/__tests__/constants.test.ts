import { describe, it, expect } from "vitest";
import {
  SP_VERSION,
  SP_FILE_EXTENSION,
  SP_CONFIG_DIR,
  SP_KEYS_DIR,
  SP_AUDIT_DIR,
  SP_AUDIT_FILE,
  SP_CONFIG_FILE,
  SP_REGISTRY_FILE,
  OPENCLAW_SKILLS_DIR,
  CLAUDE_CODE_SKILLS_DIR,
  SKILL_PLATFORMS,
  DEFAULT_MARKETPLACE_URL,
  DEFAULT_MARKETPLACE_WEB_URL,
  RATE_LIMITS,
  SKILL_CATEGORIES,
  SKILL_STATUS,
  VERSION_STATUS,
  REPORT_REASONS,
  REPORT_STATUS,
} from "../constants.js";

describe("Constants Integrity", () => {
  it("SP_VERSION should be '1.0'", () => {
    expect(SP_VERSION).toBe("1.0");
  });

  it("SP_FILE_EXTENSION should be '.ssp'", () => {
    expect(SP_FILE_EXTENSION).toBe(".ssp");
  });

  it("Config path constants should be non-empty strings", () => {
    expect(SP_CONFIG_DIR).toBeTruthy();
    expect(typeof SP_CONFIG_DIR).toBe("string");

    expect(SP_KEYS_DIR).toBeTruthy();
    expect(typeof SP_KEYS_DIR).toBe("string");

    expect(SP_AUDIT_DIR).toBeTruthy();
    expect(typeof SP_AUDIT_DIR).toBe("string");

    expect(SP_AUDIT_FILE).toBeTruthy();
    expect(typeof SP_AUDIT_FILE).toBe("string");

    expect(SP_CONFIG_FILE).toBeTruthy();
    expect(typeof SP_CONFIG_FILE).toBe("string");

    expect(SP_REGISTRY_FILE).toBeTruthy();
    expect(typeof SP_REGISTRY_FILE).toBe("string");

    expect(OPENCLAW_SKILLS_DIR).toBeTruthy();
    expect(typeof OPENCLAW_SKILLS_DIR).toBe("string");

    expect(CLAUDE_CODE_SKILLS_DIR).toBeTruthy();
    expect(typeof CLAUDE_CODE_SKILLS_DIR).toBe("string");
  });

  it("DEFAULT_MARKETPLACE_URL should start with 'https://'", () => {
    expect(DEFAULT_MARKETPLACE_URL).toMatch(/^https:\/\//);
  });

  it("DEFAULT_MARKETPLACE_WEB_URL should start with 'https://'", () => {
    expect(DEFAULT_MARKETPLACE_WEB_URL).toMatch(/^https:\/\//);
  });
});

describe("SKILL_PLATFORMS", () => {
  it("should have exactly 3 platforms", () => {
    expect(SKILL_PLATFORMS).toHaveLength(3);
  });

  it("should contain 'openclaw', 'claude-code', 'universal'", () => {
    expect(SKILL_PLATFORMS).toContain("openclaw");
    expect(SKILL_PLATFORMS).toContain("claude-code");
    expect(SKILL_PLATFORMS).toContain("universal");
  });
});

describe("SKILL_CATEGORIES", () => {
  it("should have exactly 8 categories", () => {
    expect(SKILL_CATEGORIES).toHaveLength(8);
  });

  it("should contain all expected categories", () => {
    expect(SKILL_CATEGORIES).toContain("automation");
    expect(SKILL_CATEGORIES).toContain("data");
    expect(SKILL_CATEGORIES).toContain("devtools");
    expect(SKILL_CATEGORIES).toContain("communication");
    expect(SKILL_CATEGORIES).toContain("productivity");
    expect(SKILL_CATEGORIES).toContain("security");
    expect(SKILL_CATEGORIES).toContain("ai");
    expect(SKILL_CATEGORIES).toContain("other");
  });

  it("every entry should be a non-empty lowercase string", () => {
    SKILL_CATEGORIES.forEach((category) => {
      expect(typeof category).toBe("string");
      expect(category.length).toBeGreaterThan(0);
      expect(category).toBe(category.toLowerCase());
    });
  });
});

describe("SKILL_STATUS", () => {
  it("should have exactly 5 statuses", () => {
    expect(SKILL_STATUS).toHaveLength(5);
  });

  it("should contain all expected statuses", () => {
    expect(SKILL_STATUS).toContain("draft");
    expect(SKILL_STATUS).toContain("pending_review");
    expect(SKILL_STATUS).toContain("published");
    expect(SKILL_STATUS).toContain("suspended");
    expect(SKILL_STATUS).toContain("archived");
  });
});

describe("VERSION_STATUS", () => {
  it("should have exactly 4 statuses", () => {
    expect(VERSION_STATUS).toHaveLength(4);
  });

  it("should contain all expected statuses", () => {
    expect(VERSION_STATUS).toContain("pending");
    expect(VERSION_STATUS).toContain("scanning");
    expect(VERSION_STATUS).toContain("approved");
    expect(VERSION_STATUS).toContain("rejected");
  });
});

describe("REPORT_REASONS", () => {
  it("should have exactly 7 reasons", () => {
    expect(REPORT_REASONS).toHaveLength(7);
  });

  it("should contain all expected reasons", () => {
    expect(REPORT_REASONS).toContain("malware");
    expect(REPORT_REASONS).toContain("impersonation");
    expect(REPORT_REASONS).toContain("copyright");
    expect(REPORT_REASONS).toContain("fraud");
    expect(REPORT_REASONS).toContain("vulnerability");
    expect(REPORT_REASONS).toContain("tos_violation");
    expect(REPORT_REASONS).toContain("other");
  });
});

describe("REPORT_STATUS", () => {
  it("should have exactly 4 statuses", () => {
    expect(REPORT_STATUS).toHaveLength(4);
  });

  it("should contain all expected statuses", () => {
    expect(REPORT_STATUS).toContain("open");
    expect(REPORT_STATUS).toContain("triaged");
    expect(REPORT_STATUS).toContain("resolved");
    expect(REPORT_STATUS).toContain("dismissed");
  });
});

describe("RATE_LIMITS", () => {
  it("should have all expected keys", () => {
    expect(RATE_LIMITS).toHaveProperty("unauthenticated");
    expect(RATE_LIMITS).toHaveProperty("authenticated");
    expect(RATE_LIMITS).toHaveProperty("upload");
    expect(RATE_LIMITS).toHaveProperty("download");
    expect(RATE_LIMITS).toHaveProperty("mcp");
  });

  it("all values should be positive numbers", () => {
    Object.values(RATE_LIMITS).forEach((limit) => {
      expect(typeof limit).toBe("number");
      expect(limit).toBeGreaterThan(0);
    });
  });

  it("unauthenticated limit should be less than authenticated limit", () => {
    expect(RATE_LIMITS.unauthenticated).toBeLessThan(RATE_LIMITS.authenticated);
  });
});

describe("Re-exports from index.ts", () => {
  it("should be able to import all constants from package entry point", async () => {
    const mod = await import("../index.js");

    expect(mod.SP_VERSION).toBe("1.0");
    expect(mod.SP_FILE_EXTENSION).toBe(".ssp");
    expect(mod.SP_CONFIG_DIR).toBeTruthy();
    expect(mod.SKILL_PLATFORMS).toHaveLength(3);
    expect(mod.SKILL_CATEGORIES).toHaveLength(8);
    expect(mod.SKILL_STATUS).toHaveLength(5);
    expect(mod.VERSION_STATUS).toHaveLength(4);
    expect(mod.REPORT_REASONS).toHaveLength(7);
    expect(mod.REPORT_STATUS).toHaveLength(4);
    expect(mod.RATE_LIMITS).toBeTruthy();
    expect(mod.DEFAULT_MARKETPLACE_URL).toMatch(/^https:\/\//);
    expect(mod.DEFAULT_MARKETPLACE_WEB_URL).toMatch(/^https:\/\//);
  });
});

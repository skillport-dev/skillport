import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EXIT } from "../utils/output.js";

// Mock config before importing
const mockConfig = {
  marketplace_url: "http://localhost:3001",
  marketplace_web_url: "http://localhost:3000",
  auth_token: "test-token" as string | undefined,
};
vi.mock("../utils/config.js", () => ({
  loadConfig: () => mockConfig,
}));

vi.mock("../utils/policy.js", () => ({
  checkPolicy: () => ({ allowed: true }),
}));

vi.mock("../utils/provenance.js", () => ({
  logProvenance: vi.fn(),
  detectAgent: () => "human",
}));

import { manageCommand } from "../commands/manage.js";

describe("manage command", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const originalFetch = globalThis.fetch;
  let savedAuthToken: string | undefined;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    savedAuthToken = mockConfig.auth_token;
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    globalThis.fetch = originalFetch;
    mockConfig.auth_token = savedAuthToken;
    process.exitCode = undefined;
  });

  it("rejects invalid action", async () => {
    await manageCommand("s1", "invalid");
    expect(process.exitCode).toBe(EXIT.INPUT_INVALID);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid action"));
  });

  it("rejects when not logged in", async () => {
    mockConfig.auth_token = undefined;
    await manageCommand("s1", "publish");
    expect(process.exitCode).toBe(EXIT.AUTH_REQUIRED);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
  });

  describe("set-price", () => {
    it("rejects missing price argument", async () => {
      await manageCommand("s1", "set-price", []);
      expect(process.exitCode).toBe(EXIT.INPUT_INVALID);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Missing price"));
    });

    it("rejects negative price", async () => {
      await manageCommand("s1", "set-price", ["-5"]);
      expect(process.exitCode).toBe(EXIT.INPUT_INVALID);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("non-negative"));
    });

    it("rejects non-numeric price", async () => {
      await manageCommand("s1", "set-price", ["abc"]);
      expect(process.exitCode).toBe(EXIT.INPUT_INVALID);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("non-negative"));
    });

    it("sends PATCH with correct cents value", async () => {
      let capturedUrl = "";
      let capturedBody = "";
      let capturedMethod = "";
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
        capturedUrl = url;
        capturedMethod = opts.method || "";
        capturedBody = opts.body as string;
        return {
          ok: true,
          json: async () => ({ id: "s1", price: 999, status: "draft" }),
        };
      }) as unknown as typeof fetch;

      await manageCommand("s1", "set-price", ["9.99"]);
      expect(process.exitCode).toBeUndefined();
      expect(capturedMethod).toBe("PATCH");
      expect(capturedUrl).toContain("/v1/skills/s1");
      expect(JSON.parse(capturedBody)).toEqual({ price: 999 });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("price updated"));
    });

    it("converts 0 dollars to free", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({ id: "s1", price: 0, status: "draft" }),
      })) as unknown as typeof fetch;

      await manageCommand("s1", "set-price", ["0"]);
      expect(process.exitCode).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Free"));
    });

    it("handles 403 from API", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: "Not the skill author" }),
      })) as unknown as typeof fetch;

      await manageCommand("s1", "set-price", ["5"]);
      expect(process.exitCode).toBe(EXIT.AUTH_REQUIRED);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Permission denied"));
    });

    it("handles 404 from API with helpful message", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: "Not found" }),
      })) as unknown as typeof fetch;

      await manageCommand("s1", "set-price", ["5"]);
      expect(process.exitCode).toBe(EXIT.GENERAL);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("does not support price updates"));
    });

    it("handles 400 BAD_STATUS from API", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "Price can only be changed while in draft" }),
      })) as unknown as typeof fetch;

      await manageCommand("s1", "set-price", ["5"]);
      expect(process.exitCode).toBe(EXIT.NETWORK);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("draft"));
    });
  });

  describe("publish", () => {
    it("calls POST /:id/publish on success", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
        capturedUrl = url;
        capturedMethod = opts.method || "";
        return {
          ok: true,
          json: async () => ({ id: "s1", status: "published" }),
        };
      }) as unknown as typeof fetch;

      await manageCommand("s1", "publish");
      expect(capturedMethod).toBe("POST");
      expect(capturedUrl).toContain("/v1/skills/s1/publish");
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("published"));
    });
  });

  describe("delete", () => {
    it("calls DELETE /:id on success", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
        capturedUrl = url;
        capturedMethod = opts.method || "";
        return {
          ok: true,
          json: async () => ({ id: "s1", status: "deleted" }),
        };
      }) as unknown as typeof fetch;

      await manageCommand("s1", "delete");
      expect(capturedMethod).toBe("DELETE");
      expect(capturedUrl).toBe("http://localhost:3001/v1/skills/s1");
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  assessPermissions,
  assessNetworkRisk,
  assessFilesystemRisk,
  assessExecRisk,
  formatPermissions,
} from "../index.js";
import type { Permissions } from "../index.js";

function safePermissions(): Permissions {
  return {
    network: { mode: "none" },
    filesystem: { read_paths: [], write_paths: [] },
    exec: { allowed_commands: [], shell: false },
  };
}

describe("Permission Assessment", () => {
  it("assesses safe permissions", () => {
    const summary = assessPermissions(safePermissions());
    expect(summary.overall).toBe("safe");
    expect(summary.network).toBe("safe");
    expect(summary.filesystem).toBe("safe");
    expect(summary.exec).toBe("safe");
  });

  it("assesses network allowlist risk", () => {
    const p = safePermissions();
    p.network = { mode: "allowlist", domains: ["api.example.com"] };
    expect(assessNetworkRisk(p)).toBe("low");
  });

  it("assesses filesystem write risk", () => {
    const p = safePermissions();
    p.filesystem.write_paths = ["./data"];
    expect(assessFilesystemRisk(p)).toBe("medium");
  });

  it("assesses critical filesystem risk", () => {
    const p = safePermissions();
    p.filesystem.write_paths = ["/etc/config"];
    expect(assessFilesystemRisk(p)).toBe("critical");
  });

  it("assesses exec shell risk as high", () => {
    const p = safePermissions();
    p.exec.shell = true;
    expect(assessExecRisk(p)).toBe("high");
  });

  it("overall risk is the max of all categories", () => {
    const p = safePermissions();
    p.exec.shell = true;
    const summary = assessPermissions(p);
    expect(summary.overall).toBe("high");
  });

  it("formats permissions for display", () => {
    const p = safePermissions();
    p.network = { mode: "allowlist", domains: ["api.example.com"] };
    const summary = assessPermissions(p);
    const lines = formatPermissions(p, summary);
    expect(lines.length).toBeGreaterThan(0);
    const networkLine = lines.find((l) => l.category === "network");
    expect(networkLine).toBeDefined();
    expect(networkLine!.detail).toContain("api.example.com");
  });
});

import type { Permissions } from "../manifest/schema.js";
import type { PermissionSummary, RiskLevel } from "./types.js";

export function assessNetworkRisk(permissions: Permissions): RiskLevel {
  if (permissions.network.mode === "none") return "safe";
  if (permissions.network.mode === "allowlist") {
    return permissions.network.domains.length <= 2 ? "low" : "medium";
  }
  return "safe";
}

export function assessFilesystemRisk(permissions: Permissions): RiskLevel {
  const { read_paths, write_paths } = permissions.filesystem;
  if (read_paths.length === 0 && write_paths.length === 0) return "safe";
  if (write_paths.length === 0) return "low";

  const hasSensitivePaths = write_paths.some(
    (p) => p === "/" || p === "~" || p.startsWith("/etc") || p.startsWith("/usr"),
  );
  if (hasSensitivePaths) return "critical";
  return "medium";
}

export function assessExecRisk(permissions: Permissions): RiskLevel {
  const { allowed_commands, shell } = permissions.exec;
  if (allowed_commands.length === 0 && !shell) return "safe";
  if (shell) return "high";
  return allowed_commands.length <= 3 ? "medium" : "high";
}

export function assessIntegrationsRisk(permissions: Permissions): RiskLevel {
  const integrations = permissions.integrations;
  if (!integrations) return "safe";

  const levels = [
    integrations.slack,
    integrations.gmail,
    integrations.notion,
    integrations.github,
  ].filter((l) => l && l !== "none");

  if (levels.length === 0) return "safe";
  if (levels.some((l) => l === "send" || l === "write")) return "high";
  if (levels.some((l) => l === "read")) return "medium";
  return "low";
}

const riskOrder: RiskLevel[] = ["safe", "low", "medium", "high", "critical"];

function maxRisk(...levels: RiskLevel[]): RiskLevel {
  let max = 0;
  for (const level of levels) {
    const idx = riskOrder.indexOf(level);
    if (idx > max) max = idx;
  }
  return riskOrder[max];
}

export function assessPermissions(permissions: Permissions): PermissionSummary {
  const network = assessNetworkRisk(permissions);
  const filesystem = assessFilesystemRisk(permissions);
  const exec = assessExecRisk(permissions);
  const integrations = assessIntegrationsRisk(permissions);
  const overall = maxRisk(network, filesystem, exec, integrations);

  return { network, filesystem, exec, integrations, overall };
}

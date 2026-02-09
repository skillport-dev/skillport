import type { Permissions, DangerFlag } from "../manifest/schema.js";
import type { RiskLevel, PermissionSummary } from "./types.js";

export interface PermissionDisplayLine {
  category: string;
  icon: string;
  label: string;
  detail: string;
  risk: RiskLevel;
}

export function formatPermissions(
  permissions: Permissions,
  summary: PermissionSummary,
): PermissionDisplayLine[] {
  const lines: PermissionDisplayLine[] = [];

  // Network
  if (permissions.network.mode === "none") {
    lines.push({
      category: "network",
      icon: "🔒",
      label: "Network",
      detail: "No network access",
      risk: summary.network,
    });
  } else {
    lines.push({
      category: "network",
      icon: "🌐",
      label: "Network",
      detail: `Allowed domains: ${permissions.network.domains.join(", ")}`,
      risk: summary.network,
    });
  }

  // Filesystem
  const { read_paths, write_paths } = permissions.filesystem;
  if (read_paths.length === 0 && write_paths.length === 0) {
    lines.push({
      category: "filesystem",
      icon: "🔒",
      label: "Filesystem",
      detail: "No filesystem access",
      risk: summary.filesystem,
    });
  } else {
    const parts: string[] = [];
    if (read_paths.length > 0) parts.push(`Read: ${read_paths.join(", ")}`);
    if (write_paths.length > 0) parts.push(`Write: ${write_paths.join(", ")}`);
    lines.push({
      category: "filesystem",
      icon: "📁",
      label: "Filesystem",
      detail: parts.join(" | "),
      risk: summary.filesystem,
    });
  }

  // Exec
  const { allowed_commands, shell } = permissions.exec;
  if (allowed_commands.length === 0 && !shell) {
    lines.push({
      category: "exec",
      icon: "🔒",
      label: "Execution",
      detail: "No command execution",
      risk: summary.exec,
    });
  } else {
    const parts: string[] = [];
    if (allowed_commands.length > 0)
      parts.push(`Commands: ${allowed_commands.join(", ")}`);
    if (shell) parts.push("Shell access: YES");
    lines.push({
      category: "exec",
      icon: "⚙️",
      label: "Execution",
      detail: parts.join(" | "),
      risk: summary.exec,
    });
  }

  // Integrations
  const integrations = permissions.integrations;
  if (integrations) {
    const active = Object.entries(integrations).filter(
      ([, v]) => v && v !== "none",
    );
    if (active.length > 0) {
      lines.push({
        category: "integrations",
        icon: "🔗",
        label: "Integrations",
        detail: active.map(([k, v]) => `${k}: ${v}`).join(", "),
        risk: summary.integrations,
      });
    }
  }

  return lines;
}

export function riskColor(risk: RiskLevel): string {
  switch (risk) {
    case "safe":
      return "green";
    case "low":
      return "blue";
    case "medium":
      return "yellow";
    case "high":
      return "red";
    case "critical":
      return "magenta";
  }
}

export function severityColor(severity: DangerFlag["severity"]): string {
  switch (severity) {
    case "info":
      return "gray";
    case "low":
      return "blue";
    case "medium":
      return "yellow";
    case "high":
      return "red";
    case "critical":
      return "magenta";
  }
}

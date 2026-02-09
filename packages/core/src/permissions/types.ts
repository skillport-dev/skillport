export type {
  Permissions,
  NetworkPermission,
  FilesystemPermission,
  ExecPermission,
  IntegrationsPermission,
} from "../manifest/schema.js";

export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";

export interface PermissionSummary {
  network: RiskLevel;
  filesystem: RiskLevel;
  exec: RiskLevel;
  integrations: RiskLevel;
  overall: RiskLevel;
}

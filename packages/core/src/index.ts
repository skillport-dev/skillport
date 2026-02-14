// Manifest
export {
  ManifestSchema,
  PlatformEnum,
  ClaudeCodeMetaSchema,
  OpenClawMetaSchema,
  EntrypointSchema,
  PermissionsSchema,
  NetworkPermissionSchema,
  FilesystemPermissionSchema,
  ExecPermissionSchema,
  IntegrationsPermissionSchema,
  DangerFlagSchema,
  DependencySchema,
  RequiredInputSchema,
  InstallSchema,
  AuthorSchema,
  IntegrationLevel,
  SkillInputSchema,
  SkillOutputSchema,
  ScopeSchema,
  DeclaredRiskEnum,
} from "./manifest/schema.js";
export type {
  Manifest,
  Platform,
  ClaudeCodeMeta,
  OpenClawMeta,
  Entrypoint,
  Permissions,
  NetworkPermission,
  FilesystemPermission,
  ExecPermission,
  IntegrationsPermission,
  DangerFlag,
  Dependency,
  RequiredInput,
  Install,
  Author,
  Severity,
  SkillInput,
  SkillOutput,
  Scope,
  DeclaredRisk,
} from "./manifest/schema.js";

// Convert
export {
  detectPlatform,
  convertToClaudeCode,
  convertToOpenClaw,
  convertToUniversal,
  extractPlatformMeta,
  embedPlatformMeta,
} from "./convert/index.js";
export type {
  ConvertOptions,
  ConvertResult,
  ConvertWarning,
} from "./convert/index.js";

// Crypto
export { generateKeyPair, computeKeyId } from "./crypto/keys.js";
export { signManifest } from "./crypto/sign.js";
export { verifySignature } from "./crypto/verify.js";
export { sha256, computeChecksums, verifyChecksums } from "./crypto/checksum.js";

// Archive
export { createSSP } from "./archive/create.js";
export { extractSSP } from "./archive/extract.js";
export type { CreateSSPOptions, SSPContents } from "./archive/create.js";
export type { ExtractedSSP } from "./archive/extract.js";

// Permissions
export type { RiskLevel, PermissionSummary } from "./permissions/types.js";
export {
  assessPermissions,
  assessNetworkRisk,
  assessFilesystemRisk,
  assessExecRisk,
  assessIntegrationsRisk,
} from "./permissions/validate.js";
export {
  formatPermissions,
  riskColor,
  severityColor,
} from "./permissions/display.js";
export type { PermissionDisplayLine } from "./permissions/display.js";

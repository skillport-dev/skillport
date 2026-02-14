import { z } from "zod";

const semverRegex = /^\d+\.\d+\.\d+$/;
const semverRangeRegex = /^[\^~>=<\s\d.|]+$/;

export const EntrypointSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  file: z.string().min(1),
});

export const NetworkPermissionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("allowlist"), domains: z.array(z.string()) }),
]);

export const FilesystemPermissionSchema = z.object({
  read_paths: z.array(z.string()),
  write_paths: z.array(z.string()),
});

export const ExecPermissionSchema = z.object({
  allowed_commands: z.array(z.string()),
  shell: z.boolean(),
});

export const IntegrationLevel = z.enum(["none", "read", "write", "send"]);

export const IntegrationsPermissionSchema = z.object({
  slack: IntegrationLevel.optional(),
  gmail: IntegrationLevel.optional(),
  notion: IntegrationLevel.optional(),
  github: IntegrationLevel.optional(),
});

export const PermissionsSchema = z.object({
  network: NetworkPermissionSchema,
  filesystem: FilesystemPermissionSchema,
  exec: ExecPermissionSchema,
  integrations: IntegrationsPermissionSchema.optional(),
});

export const DangerFlagSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  message: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
});

export const DependencySchema = z.object({
  name: z.string(),
  type: z.enum(["cli", "npm", "pip", "brew", "apt", "other"]),
  version: z.string().optional(),
  optional: z.boolean().optional(),
});

export const RequiredInputSchema = z.object({
  key: z.string(),
  description: z.string(),
  type: z.enum(["string", "secret", "number", "boolean"]),
  required: z.boolean(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const InstallSchema = z.object({
  steps: z.array(z.string()),
  required_inputs: z.array(RequiredInputSchema),
});

export const AuthorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  signing_key_id: z.string(),
});

export const PlatformEnum = z.enum(["openclaw", "claude-code", "universal"]);

export const ClaudeCodeMetaSchema = z.object({
  user_invocable: z.boolean().default(true),
  allowed_tools: z.array(z.string()).optional(),
  argument_hint: z.string().optional(),
  context: z.literal("fork").optional(),
  agent: z.string().optional(),
  model: z.enum(["sonnet", "opus", "haiku", "inherit"]).default("inherit"),
  has_dynamic_context: z.boolean().default(false),
});

export const OpenClawMetaSchema = z.object({
  requires: z.string().optional(),
  install_steps: z.array(z.string()).optional(),
});

// --- Agent-native fields (Phase 7C) ---

export const SkillInputSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "file", "secret"]),
  description: z.string(),
  required: z.boolean().default(true),
  schema: z.record(z.unknown()).optional(),
});

export const SkillOutputSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "file", "directory", "json"]),
  description: z.string(),
  schema: z.record(z.unknown()).optional(),
});

export const ScopeSchema = z.object({
  files: z.boolean().default(false),
  network: z.boolean().default(false),
  processes: z.boolean().default(false),
  env_vars: z.boolean().default(false),
});

export const DeclaredRiskEnum = z.enum(["low", "medium", "high"]);

export const ManifestSchema = z.object({
  ssp_version: z.literal("1.0"),
  id: z
    .string()
    .regex(/^[a-z0-9_-]+\/[a-z0-9_-]+$/, "Must be 'author-slug/skill-slug'"),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  version: z.string().regex(semverRegex, "Must be valid semver (x.y.z)"),
  author: AuthorSchema,
  platform: PlatformEnum.default("openclaw"),
  openclaw_compat: z
    .string()
    .regex(semverRangeRegex, "Must be a valid semver range")
    .optional(),
  claude_code: ClaudeCodeMetaSchema.optional(),
  openclaw: OpenClawMetaSchema.optional(),
  os_compat: z.array(z.enum(["macos", "linux", "windows"])).min(1),
  entrypoints: z.array(EntrypointSchema).min(1),
  permissions: PermissionsSchema,
  dependencies: z.array(DependencySchema),
  danger_flags: z.array(DangerFlagSchema),
  install: InstallSchema,
  hashes: z.record(z.string(), z.string()),
  created_at: z.string().datetime(),

  // Agent-native: inputs/outputs for typed skill interface
  inputs: z.array(SkillInputSchema).default([]),
  outputs: z.array(SkillOutputSchema).default([]),

  // Agent-native: scope declaration
  scope: ScopeSchema.default({}),

  // Agent-native: cost/time hints
  estimated_duration_seconds: z.number().optional(),
  estimated_tokens: z.number().optional(),

  // Agent-native: author-declared risk level
  declared_risk: DeclaredRiskEnum.default("medium"),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type Platform = z.infer<typeof PlatformEnum>;
export type ClaudeCodeMeta = z.infer<typeof ClaudeCodeMetaSchema>;
export type OpenClawMeta = z.infer<typeof OpenClawMetaSchema>;
export type Entrypoint = z.infer<typeof EntrypointSchema>;
export type Permissions = z.infer<typeof PermissionsSchema>;
export type NetworkPermission = z.infer<typeof NetworkPermissionSchema>;
export type FilesystemPermission = z.infer<typeof FilesystemPermissionSchema>;
export type ExecPermission = z.infer<typeof ExecPermissionSchema>;
export type IntegrationsPermission = z.infer<
  typeof IntegrationsPermissionSchema
>;
export type DangerFlag = z.infer<typeof DangerFlagSchema>;
export type Dependency = z.infer<typeof DependencySchema>;
export type RequiredInput = z.infer<typeof RequiredInputSchema>;
export type Install = z.infer<typeof InstallSchema>;
export type Author = z.infer<typeof AuthorSchema>;
export type Severity = DangerFlag["severity"];
export type SkillInput = z.infer<typeof SkillInputSchema>;
export type SkillOutput = z.infer<typeof SkillOutputSchema>;
export type Scope = z.infer<typeof ScopeSchema>;
export type DeclaredRisk = z.infer<typeof DeclaredRiskEnum>;

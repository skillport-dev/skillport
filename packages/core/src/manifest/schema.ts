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

export const ManifestSchema = z.object({
  ssp_version: z.literal("1.0"),
  id: z
    .string()
    .regex(/^[a-z0-9_-]+\/[a-z0-9_-]+$/, "Must be 'author-slug/skill-slug'"),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  version: z.string().regex(semverRegex, "Must be valid semver (x.y.z)"),
  author: AuthorSchema,
  openclaw_compat: z
    .string()
    .regex(semverRangeRegex, "Must be a valid semver range"),
  os_compat: z.array(z.enum(["macos", "linux", "windows"])).min(1),
  entrypoints: z.array(EntrypointSchema).min(1),
  permissions: PermissionsSchema,
  dependencies: z.array(DependencySchema),
  danger_flags: z.array(DangerFlagSchema),
  install: InstallSchema,
  hashes: z.record(z.string(), z.string()),
  created_at: z.string().datetime(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
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

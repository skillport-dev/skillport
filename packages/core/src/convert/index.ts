/**
 * Convert module — cross-platform skill conversion.
 */

export interface ConvertOptions {
  preserveMeta?: boolean;
  inferTools?: boolean;
}

export interface ConvertResult {
  skillMd: string;
  files: Map<string, Buffer>;
  warnings: ConvertWarning[];
  platform: "openclaw" | "claude-code" | "universal";
}

export interface ConvertWarning {
  type: "dynamic_context" | "arguments" | "tools" | "install" | "permissions" | "security";
  message: string;
  line?: number;
}

export { detectPlatform, detectDynamicContexts, detectArgumentPlaceholders } from "./detect.js";
export { convertToClaudeCode } from "./openclaw-to-claude.js";
export { convertToOpenClaw } from "./claude-to-openclaw.js";
export { convertToUniversal } from "./universal.js";
export {
  extractPlatformMeta,
  embedPlatformMeta,
  extractDynamicContextMeta,
  embedDynamicContextComment,
  stripMetadataComments,
} from "./metadata-comments.js";
export type { PlatformMeta, ExtractResult, DynamicContextMeta } from "./metadata-comments.js";

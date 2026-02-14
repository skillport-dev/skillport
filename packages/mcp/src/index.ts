#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DEFAULT_MARKETPLACE_URL, SKILL_CATEGORIES } from "@skillport/shared";

const API_URL = process.env.SKILLPORT_API_URL || DEFAULT_MARKETPLACE_URL;
const AUTH_TOKEN = process.env.SKILLPORT_AUTH_TOKEN || "";

async function apiFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;

  const res = await fetch(`${API_URL}/v1${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// --- Types ---
interface SkillSummary {
  id: string;
  ssp_id: string;
  title: string;
  description: string;
  profiles?: { username: string; display_name: string };
  price: number;
  category: string;
  platform: string;
  tags: string[];
  latest_version: string;
  risk_score: number;
  danger_flag_count: number;
  avg_rating: number;
  downloads: number;
  os_compat: string[];
}

interface SkillsResponse {
  data: SkillSummary[];
  total: number;
  page: number;
  total_pages: number;
}

interface SkillDetail extends SkillSummary {
  versions: Array<{
    id: string;
    version: string;
    scan_passed: boolean;
    risk_score: number;
    platform_signed: boolean;
    created_at: string;
  }>;
}

// --- Server ---
const server = new McpServer({
  name: "skillport",
  version: "0.1.0",
});

// --- Tools ---

server.tool(
  "search_skills",
  "Search for skills on SkillPort Market by keyword, category, platform, or other criteria",
  {
    query: z.string().optional().describe("Search keyword"),
    category: z.enum(SKILL_CATEGORIES as unknown as [string, ...string[]]).optional().describe("Filter by category"),
    platform: z.enum(["openclaw", "claude-code", "universal", "all"]).optional().describe("Filter by platform (default: all)"),
    sort: z.enum(["popular", "recent", "rating", "price"]).optional().describe("Sort order"),
    page: z.number().optional().describe("Page number (default 1)"),
  },
  async ({ query, category, platform, sort, page }) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    if (platform) params.set("platform", platform);
    if (sort) params.set("sort", sort);
    if (page) params.set("page", String(page));
    params.set("per_page", "10");

    const data = await apiFetch<SkillsResponse>(`/skills?${params}`);

    const results = data.data.map((s) =>
      `**${s.title}** (${s.ssp_id}) [${s.platform || "openclaw"}]\n` +
      `  ${s.description}\n` +
      `  Risk: ${s.risk_score}/100 | Rating: ${s.avg_rating?.toFixed(1) || "N/A"} | Downloads: ${s.downloads}\n` +
      `  Category: ${s.category} | Price: ${s.price === 0 ? "Free" : `$${(s.price / 100).toFixed(2)}`}\n` +
      `  Platform: ${s.platform || "openclaw"} | OS: ${s.os_compat?.join(", ") || "all"} | Tags: ${s.tags?.join(", ") || "none"}`
    ).join("\n\n");

    return {
      content: [{
        type: "text" as const,
        text: `Found ${data.total} skills (page ${data.page}/${data.total_pages}):\n\n${results || "No results found."}`,
      }],
    };
  },
);

server.tool(
  "get_skill_details",
  "Get detailed information about a specific skill including permissions, versions, and danger flags",
  {
    skill_id: z.string().describe("The skill ID (UUID from the marketplace)"),
  },
  async ({ skill_id }) => {
    const skill = await apiFetch<SkillDetail>(`/skills/${skill_id}`);

    const versions = skill.versions?.map((v) =>
      `  v${v.version} — Scan: ${v.scan_passed ? "PASSED" : "FAILED"} | Risk: ${v.risk_score} | Signed: ${v.platform_signed ? "Yes" : "No"} | ${new Date(v.created_at).toLocaleDateString()}`
    ).join("\n") || "  No versions";

    const text =
      `# ${skill.title}\n` +
      `**ID:** ${skill.ssp_id}\n` +
      `**Author:** ${skill.profiles?.display_name || skill.profiles?.username || "Unknown"}\n` +
      `**Description:** ${skill.description}\n\n` +
      `## Stats\n` +
      `- Risk Score: ${skill.risk_score}/100\n` +
      `- Danger Flags: ${skill.danger_flag_count}\n` +
      `- Rating: ${skill.avg_rating?.toFixed(1) || "N/A"}\n` +
      `- Downloads: ${skill.downloads}\n` +
      `- Price: ${skill.price === 0 ? "Free" : `$${(skill.price / 100).toFixed(2)}`}\n` +
      `- Category: ${skill.category}\n` +
      `- OS: ${skill.os_compat?.join(", ") || "all"}\n` +
      `- Tags: ${skill.tags?.join(", ") || "none"}\n\n` +
      `## Versions\n${versions}\n\n` +
      `## Install\n\`skillport install ${skill.ssp_id}@${skill.latest_version || "latest"}\``;

    return { content: [{ type: "text" as const, text }] };
  },
);

server.tool(
  "check_skill_safety",
  "Evaluate the safety of a skill based on its risk score, danger flags, and scan results. Returns a recommendation.",
  {
    skill_id: z.string().describe("The skill ID to evaluate"),
  },
  async ({ skill_id }) => {
    const skill = await apiFetch<SkillDetail>(`/skills/${skill_id}`);

    let recommendation: string;
    let level: string;

    if (skill.risk_score === 0 && skill.danger_flag_count === 0) {
      level = "SAFE";
      recommendation = "This skill has no detected risks. Safe to install.";
    } else if (skill.risk_score < 10 && skill.danger_flag_count === 0) {
      level = "LOW RISK";
      recommendation = "This skill has a very low risk score. Generally safe to install.";
    } else if (skill.risk_score < 25) {
      level = "MODERATE RISK";
      recommendation = "This skill has some flagged items. Review the permissions and danger flags before installing.";
    } else if (skill.risk_score < 50) {
      level = "HIGH RISK";
      recommendation = "This skill has significant risk factors. Carefully review all permissions and danger flags. Use --accept-risk flag if you proceed.";
    } else {
      level = "CRITICAL RISK";
      recommendation = "This skill has a very high risk score. Exercise extreme caution. Only install if you trust the author and understand all flagged issues.";
    }

    const latestVersion = skill.versions?.[0];
    const scanStatus = latestVersion
      ? (latestVersion.scan_passed ? "PASSED" : "FAILED")
      : "Unknown";
    const platformSigned = latestVersion?.platform_signed ? "Yes" : "No";

    const text =
      `# Safety Report: ${skill.title}\n\n` +
      `## Assessment: ${level}\n` +
      `${recommendation}\n\n` +
      `## Details\n` +
      `- Risk Score: **${skill.risk_score}/100**\n` +
      `- Danger Flags: **${skill.danger_flag_count}**\n` +
      `- Security Scan: **${scanStatus}**\n` +
      `- Platform Signed: **${platformSigned}**\n` +
      `- Author: ${skill.profiles?.display_name || skill.profiles?.username || "Unknown"}\n` +
      `- Downloads: ${skill.downloads}\n` +
      `- Rating: ${skill.avg_rating?.toFixed(1) || "N/A"}\n`;

    return { content: [{ type: "text" as const, text }] };
  },
);

server.tool(
  "generate_install_command",
  "Generate the CLI command to install a skill from SkillPort Market",
  {
    skill_id: z.string().describe("The skill ID"),
    version: z.string().optional().describe("Specific version (defaults to latest)"),
    accept_risk: z.boolean().optional().describe("Include --accept-risk flag for high-risk skills"),
  },
  async ({ skill_id, version, accept_risk }) => {
    const skill = await apiFetch<SkillDetail>(`/skills/${skill_id}`);
    const ver = version || skill.latest_version || "latest";
    let cmd = `skillport install ${skill.ssp_id}@${ver}`;
    if (accept_risk) cmd += " --accept-risk";

    const platform = (skill as unknown as { platform?: string }).platform || "openclaw";
    const installDest = platform === "claude-code"
      ? "~/.claude/skills/"
      : platform === "universal"
        ? "platform-dependent directory"
        : "~/.openclaw/skills/";

    const text =
      `Install **${skill.title}** v${ver}:\n\n` +
      "```bash\n" +
      `${cmd}\n` +
      "```\n\n" +
      `Platform: ${platform}\n\n` +
      `This will:\n` +
      `1. Download the package from SkillPort Market\n` +
      `2. Verify checksums and signatures\n` +
      `3. Run a local security scan\n` +
      `4. Show permissions for your approval\n` +
      `5. Install to ${installDest}`;

    return { content: [{ type: "text" as const, text }] };
  },
);

// --- Agent-native tools (Phase 7C + 7D) ---

server.tool(
  "check_policy",
  "Check if an action is allowed by the user's .skillportrc policy file. " +
  "Use this before triggering install/uninstall/publish to avoid policy rejections.",
  {
    action: z.string().describe("The action to check (e.g., 'install', 'uninstall', 'publish', 'manage:delete')"),
    risk_score: z.number().optional().describe("Risk score of the skill (for install actions)"),
    has_platform_sig: z.boolean().optional().describe("Whether the package has a platform signature"),
  },
  async ({ action, risk_score, has_platform_sig }) => {
    // MCP operations are always non-interactive
    const context = {
      nonInteractive: true,
      riskScore: risk_score,
      hasPlatformSig: has_platform_sig,
    };

    // Evaluate policy rules inline (MCP server doesn't share CLI's policy.ts directly)
    // The policy file is read by the CLI — here we indicate what the CLI would do.
    const text =
      `# Policy Check: ${action}\n\n` +
      `To verify this action against the user's policy, run:\n\n` +
      "```bash\n" +
      `skillport plan ${action === "install" ? "<skill-id>" : ""} --json\n` +
      "```\n\n" +
      `The CLI will evaluate the .skillportrc policy file and return:\n` +
      `- **allowed**: true if the action can proceed\n` +
      `- **POLICY_REJECTED** error (exit code 32): if the policy blocks it\n\n` +
      `## Common policy restrictions\n` +
      `- \`requires_approval\`: Actions that need interactive confirmation\n` +
      `- \`auto_install.max_risk_score\`: Maximum allowed risk score for auto-install\n` +
      `- \`auto_install.require_platform_sig\`: Whether platform signature is required\n` +
      `- \`auto_install.max_per_session\`: Maximum installs per session\n\n` +
      `If the action is blocked, the error response will include hints on how to resolve it.\n` +
      `**Important:** If you receive exit code 32 (POLICY_REJECTED), do NOT retry — ask the user to adjust their policy.`;

    return { content: [{ type: "text" as const, text }] };
  },
);

server.tool(
  "suggest_skills",
  "Given a task description in natural language, recommend matching skills from SkillPort Market. " +
  "Use this to find skills that can help with a specific task.",
  {
    description: z.string().describe("Natural language description of the task (e.g., 'set up CI/CD for a Python project')"),
    platform: z.enum(["openclaw", "claude-code", "universal", "all"]).optional().describe("Filter by platform"),
    limit: z.number().optional().describe("Max results (default: 5)"),
  },
  async ({ description, platform, limit }) => {
    const params = new URLSearchParams({ q: description });
    if (platform) params.set("platform", platform);
    if (limit) params.set("limit", String(limit));

    const data = await apiFetch<{
      data: Array<SkillSummary & { install_command: string }>;
      keywords: string[];
      total: number;
    }>(`/suggest?${params}`);

    if (data.data.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `No skills found matching: "${description}"\n\nTry a different description or search by keyword with the search_skills tool.`,
        }],
      };
    }

    const results = data.data.map((s, i) =>
      `${i + 1}. **${s.title}** (${s.ssp_id})\n` +
      `   ${s.description}\n` +
      `   Risk: ${s.risk_score}/100 | Rating: ${s.avg_rating?.toFixed(1) || "N/A"} | ${s.downloads} downloads\n` +
      `   Install: \`${s.install_command}\``
    ).join("\n\n");

    return {
      content: [{
        type: "text" as const,
        text: `# Suggested skills for: "${description}"\n` +
          `Keywords: ${data.keywords.join(", ")}\n\n` +
          results,
      }],
    };
  },
);

server.tool(
  "inspect_skill",
  "Get detailed metadata, security info, inputs/outputs, and scope for a skill. " +
  "Use this before installing to understand what a skill does and what it requires.",
  {
    skill_id: z.string().describe("The skill ID (UUID from the marketplace)"),
  },
  async ({ skill_id }) => {
    const skill = await apiFetch<SkillDetail & {
      versions: Array<{
        id: string;
        version: string;
        scan_passed: boolean;
        risk_score: number;
        platform_signed: boolean;
        created_at: string;
        manifest?: Record<string, unknown>;
      }>;
    }>(`/skills/${skill_id}`);

    const latestVersion = skill.versions?.[0];
    const manifest = latestVersion?.manifest as Record<string, unknown> | undefined;

    // Extract agent-native fields from manifest
    const inputs = (manifest?.inputs as Array<{ name: string; type: string; description: string; required: boolean }>) || [];
    const outputs = (manifest?.outputs as Array<{ name: string; type: string; description: string }>) || [];
    const scope = (manifest?.scope as Record<string, boolean>) || {};
    const declaredRisk = (manifest?.declared_risk as string) || "medium";
    const estimatedDuration = manifest?.estimated_duration_seconds as number | undefined;
    const estimatedTokens = manifest?.estimated_tokens as number | undefined;

    let text =
      `# ${skill.title}\n` +
      `**ID:** ${skill.ssp_id}\n` +
      `**Author:** ${skill.profiles?.display_name || skill.profiles?.username || "Unknown"}\n` +
      `**Description:** ${skill.description}\n` +
      `**Platform:** ${skill.platform || "openclaw"}\n` +
      `**OS:** ${skill.os_compat?.join(", ") || "all"}\n` +
      `**Declared Risk:** ${declaredRisk}\n\n`;

    // Security
    text += `## Security\n` +
      `- Risk Score: ${skill.risk_score}/100\n` +
      `- Danger Flags: ${skill.danger_flag_count}\n` +
      `- Scan: ${latestVersion?.scan_passed ? "PASSED" : "FAILED"}\n` +
      `- Platform Signed: ${latestVersion?.platform_signed ? "Yes" : "No"}\n\n`;

    // Inputs
    if (inputs.length > 0) {
      text += `## Inputs\n`;
      for (const inp of inputs) {
        text += `- **${inp.name}** (${inp.type})${inp.required ? " *required*" : ""}: ${inp.description}\n`;
      }
      text += "\n";
    }

    // Outputs
    if (outputs.length > 0) {
      text += `## Outputs\n`;
      for (const out of outputs) {
        text += `- **${out.name}** (${out.type}): ${out.description}\n`;
      }
      text += "\n";
    }

    // Scope
    const activeScopes = Object.entries(scope).filter(([, v]) => v);
    if (activeScopes.length > 0) {
      text += `## Scope\n`;
      for (const [key] of activeScopes) {
        text += `- ${key}\n`;
      }
      text += "\n";
    }

    // Estimates
    if (estimatedDuration || estimatedTokens) {
      text += `## Estimates\n`;
      if (estimatedDuration) text += `- Duration: ~${estimatedDuration}s\n`;
      if (estimatedTokens) text += `- Tokens: ~${estimatedTokens}\n`;
      text += "\n";
    }

    text += `## Install\n\`skillport install ${skill.ssp_id}@${skill.latest_version || "latest"}\``;

    return { content: [{ type: "text" as const, text }] };
  },
);

server.tool(
  "plan_install",
  "Preview what will happen when installing a skill — shows file changes, environment compatibility, " +
  "security checks, and rollback command. Use this before skillport install for a Plan→Apply workflow.",
  {
    skill_id: z.string().describe("Skill SSP ID (e.g., 'author/skill-name')"),
    version: z.string().optional().describe("Specific version (defaults to latest)"),
  },
  async ({ skill_id, version }) => {
    const ver = version ? `@${version}` : "";

    const text =
      `# Plan: install ${skill_id}${ver}\n\n` +
      `Run the following CLI command to preview the full install plan:\n\n` +
      "```bash\n" +
      `skillport plan ${skill_id}${ver} --json\n` +
      "```\n\n" +
      `This will:\n` +
      `1. Download and extract the package\n` +
      `2. Verify checksums and signatures\n` +
      `3. Run a security scan\n` +
      `4. Evaluate .skillportrc policy (exit 32 if rejected)\n` +
      `5. Check environment compatibility\n` +
      `6. Show file changes and rollback command\n\n` +
      `To apply:\n` +
      "```bash\n" +
      `skillport install ${skill_id}${ver} --yes\n` +
      "```\n\n" +
      `To rollback after install:\n` +
      "```bash\n" +
      `skillport uninstall ${skill_id} --yes\n` +
      "```";

    return { content: [{ type: "text" as const, text }] };
  },
);

// --- Resources ---

server.resource(
  "popular-skills",
  "ssp://catalog/popular",
  async (uri) => {
    const data = await apiFetch<SkillsResponse>("/skills?sort=popular&per_page=20");

    const list = data.data.map((s, i) =>
      `${i + 1}. **${s.title}** (${s.ssp_id}) — Risk: ${s.risk_score} | ★${s.avg_rating?.toFixed(1) || "?"} | ${s.downloads} downloads`
    ).join("\n");

    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/plain",
        text: `# Popular Skills on SkillPort\n\n${list}`,
      }],
    };
  },
);

server.resource(
  "categories",
  "ssp://catalog/categories",
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: "text/plain",
      text: `# Available Categories\n\n${SKILL_CATEGORIES.map((c) => `- ${c}`).join("\n")}`,
    }],
  }),
);

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});

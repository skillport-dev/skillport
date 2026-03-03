/**
 * MCP server tests
 *
 * Strategy: mock @modelcontextprotocol/sdk so that tool handlers are captured
 * into a local Map when the module runs server.tool(). Then call the captured
 * handlers directly, with global fetch mocked to simulate API responses.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- captured state shared by the mock ----
type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const capturedTools = new Map<string, Handler>();
const capturedResources = new Map<string, Handler>();

// ---- mock MCP SDK before any import of the module under test ----
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    tool: vi.fn(
      (name: string, _desc: string, _schema: unknown, handler: Handler) => {
        capturedTools.set(name, handler);
      }
    ),
    resource: vi.fn(
      (name: string, _uri: string, handler: Handler) => {
        capturedResources.set(name, handler);
      }
    ),
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

// ---- set env vars before importing the module ----
process.env.SKILLPORT_API_URL = "http://test-api";
process.env.SKILLPORT_AUTH_TOKEN = "test-token";

// ---- mock fetch before module import ----
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---- import the module under test (side-effects register tools) ----
await import("../index.js");

// ---- helpers ----
function makeOkResponse(body: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  };
}

function makeErrorResponse(status: number, errorBody?: unknown) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue(errorBody ?? {}),
  };
}

function makeSkillSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "uuid-001",
    ssp_id: "author/my-skill",
    title: "My Skill",
    description: "A useful skill",
    profiles: { username: "author", display_name: "Author Name" },
    price: 0,
    category: "devtools",
    platform: "openclaw",
    tags: ["test", "demo"],
    latest_version: "1.0.0",
    risk_score: 0,
    danger_flag_count: 0,
    avg_rating: 4.5,
    downloads: 123,
    os_compat: ["linux", "macos"],
    versions: [],
    ...overrides,
  };
}

function makeSkillsResponse(skills: unknown[] = [], total = 0) {
  return { data: skills, total, page: 1, total_pages: 1 };
}

function extractText(result: unknown): string {
  const r = result as { content: Array<{ type: string; text: string }> };
  return r.content[0].text;
}

// ---- reset mock between tests ----
beforeEach(() => {
  mockFetch.mockReset();
});

// ============================================================
// apiFetch behavior
// ============================================================
describe("apiFetch — called indirectly through tool invocations", () => {
  it("includes Authorization header when SKILLPORT_AUTH_TOKEN is set", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(makeSkillsResponse()));

    const handler = capturedTools.get("search_skills")!;
    await handler({ query: "hello" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("http://test-api/v1/skills");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-token"
    );
  });

  it("throws with API error message when response is not ok", async () => {
    mockFetch.mockResolvedValue(
      makeErrorResponse(422, { error: "Validation failed" })
    );

    const handler = capturedTools.get("search_skills")!;
    await expect(handler({ query: "bad" })).rejects.toThrow("Validation failed");
  });

  it("throws generic API error when response body has no error field", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(500));

    const handler = capturedTools.get("search_skills")!;
    await expect(handler({ query: "any" })).rejects.toThrow("API error: 500");
  });
});

// ============================================================
// search_skills tool
// ============================================================
describe("search_skills tool", () => {
  it("returns formatted results when skills are found", async () => {
    const skill = makeSkillSummary();
    mockFetch.mockResolvedValue(makeOkResponse(makeSkillsResponse([skill], 1)));

    const handler = capturedTools.get("search_skills")!;
    const result = await handler({ query: "my skill" });
    const text = extractText(result);

    expect(text).toContain("Found 1 skills");
    expect(text).toContain("My Skill");
    expect(text).toContain("author/my-skill");
  });

  it("returns 'No results found' when data array is empty", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(makeSkillsResponse([], 0)));

    const handler = capturedTools.get("search_skills")!;
    const result = await handler({ query: "nonexistent" });
    const text = extractText(result);

    expect(text).toContain("No results found");
  });

  it("appends all provided query parameters to the URL", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(makeSkillsResponse()));

    const handler = capturedTools.get("search_skills")!;
    await handler({
      query: "ci",
      category: "devtools",
      platform: "claude-code",
      sort: "popular",
      page: 2,
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("q=ci");
    expect(url).toContain("category=devtools");
    expect(url).toContain("platform=claude-code");
    expect(url).toContain("sort=popular");
    expect(url).toContain("page=2");
    expect(url).toContain("per_page=10");
  });

  it("always includes per_page=10 even when no params given", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(makeSkillsResponse()));

    const handler = capturedTools.get("search_skills")!;
    await handler({});

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("per_page=10");
  });

  it("shows price as 'Free' when price is 0", async () => {
    const skill = makeSkillSummary({ price: 0 });
    mockFetch.mockResolvedValue(makeOkResponse(makeSkillsResponse([skill], 1)));

    const handler = capturedTools.get("search_skills")!;
    const result = await handler({});
    const text = extractText(result);

    expect(text).toContain("Free");
  });

  it("shows price in dollars when price is non-zero", async () => {
    const skill = makeSkillSummary({ price: 999 });
    mockFetch.mockResolvedValue(makeOkResponse(makeSkillsResponse([skill], 1)));

    const handler = capturedTools.get("search_skills")!;
    const result = await handler({});
    const text = extractText(result);

    expect(text).toContain("$9.99");
  });
});

// ============================================================
// get_skill_details tool
// ============================================================
describe("get_skill_details tool", () => {
  it("fetches from /skills/:id and returns formatted markdown", async () => {
    const skill = makeSkillSummary({
      versions: [
        {
          id: "v1",
          version: "1.0.0",
          scan_passed: true,
          risk_score: 2,
          platform_signed: true,
          created_at: "2024-01-15T00:00:00Z",
        },
      ],
    });
    mockFetch.mockResolvedValue(makeOkResponse(skill));

    const handler = capturedTools.get("get_skill_details")!;
    const result = await handler({ skill_id: "uuid-001" });
    const text = extractText(result);

    expect(text).toContain("# My Skill");
    expect(text).toContain("author/my-skill");
    expect(text).toContain("Author Name");
    expect(text).toContain("v1.0.0");
    expect(text).toContain("PASSED");
    expect(text).toContain("skillport install author/my-skill@1.0.0");
  });

  it("shows 'No versions' when versions array is empty", async () => {
    const skill = makeSkillSummary({ versions: [] });
    mockFetch.mockResolvedValue(makeOkResponse(skill));

    const handler = capturedTools.get("get_skill_details")!;
    const result = await handler({ skill_id: "uuid-001" });
    const text = extractText(result);

    expect(text).toContain("No versions");
  });

  it("calls the correct API endpoint", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(makeSkillSummary()));

    const handler = capturedTools.get("get_skill_details")!;
    await handler({ skill_id: "uuid-999" });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("http://test-api/v1/skills/uuid-999");
  });
});

// ============================================================
// check_skill_safety tool — risk thresholds
// ============================================================
describe("check_skill_safety tool — risk level thresholds", () => {
  async function checkSafety(riskScore: number, dangerFlagCount: number) {
    const skill = makeSkillSummary({
      risk_score: riskScore,
      danger_flag_count: dangerFlagCount,
      versions: [
        {
          id: "v1",
          version: "1.0.0",
          scan_passed: true,
          risk_score: riskScore,
          platform_signed: false,
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
    });
    mockFetch.mockResolvedValue(makeOkResponse(skill));

    const handler = capturedTools.get("check_skill_safety")!;
    const result = await handler({ skill_id: "uuid-001" });
    return extractText(result);
  }

  it("risk_score=0 danger_flags=0 → SAFE", async () => {
    const text = await checkSafety(0, 0);
    expect(text).toContain("## Assessment: SAFE");
    expect(text).toContain("Safe to install");
  });

  it("risk_score=5 danger_flags=0 → LOW RISK", async () => {
    const text = await checkSafety(5, 0);
    expect(text).toContain("## Assessment: LOW RISK");
    expect(text).toContain("very low risk score");
  });

  it("risk_score=15 danger_flags=1 → MODERATE RISK", async () => {
    const text = await checkSafety(15, 1);
    expect(text).toContain("## Assessment: MODERATE RISK");
    expect(text).toContain("some flagged items");
  });

  it("risk_score=9 danger_flags=1 → MODERATE RISK (flag count overrides low score)", async () => {
    // risk_score < 10 but danger_flag_count > 0 => falls through to < 25 branch
    const text = await checkSafety(9, 1);
    expect(text).toContain("## Assessment: MODERATE RISK");
  });

  it("risk_score=35 → HIGH RISK", async () => {
    const text = await checkSafety(35, 0);
    expect(text).toContain("## Assessment: HIGH RISK");
    expect(text).toContain("significant risk factors");
  });

  it("risk_score=60 → CRITICAL RISK", async () => {
    const text = await checkSafety(60, 0);
    expect(text).toContain("## Assessment: CRITICAL RISK");
    expect(text).toContain("extreme caution");
  });

  it("shows scan status and platform signed fields", async () => {
    const text = await checkSafety(0, 0);
    expect(text).toContain("Security Scan: **PASSED**");
    expect(text).toContain("Platform Signed: **No**");
  });

  it("shows 'Unknown' scan status when versions array is empty", async () => {
    const skill = makeSkillSummary({
      risk_score: 0,
      danger_flag_count: 0,
      versions: [],
    });
    mockFetch.mockResolvedValue(makeOkResponse(skill));

    const handler = capturedTools.get("check_skill_safety")!;
    const result = await handler({ skill_id: "uuid-001" });
    const text = extractText(result);

    expect(text).toContain("Security Scan: **Unknown**");
  });
});

// ============================================================
// generate_install_command tool
// ============================================================
describe("generate_install_command tool", () => {
  it("claude-code platform → shows ~/.claude/skills/ install path", async () => {
    const skill = makeSkillSummary({ platform: "claude-code" });
    mockFetch.mockResolvedValue(makeOkResponse(skill));

    const handler = capturedTools.get("generate_install_command")!;
    const result = await handler({ skill_id: "uuid-001" });
    const text = extractText(result);

    expect(text).toContain("~/.claude/skills/");
  });

  it("openclaw platform → shows ~/.openclaw/skills/ install path", async () => {
    const skill = makeSkillSummary({ platform: "openclaw" });
    mockFetch.mockResolvedValue(makeOkResponse(skill));

    const handler = capturedTools.get("generate_install_command")!;
    const result = await handler({ skill_id: "uuid-001" });
    const text = extractText(result);

    expect(text).toContain("~/.openclaw/skills/");
  });

  it("universal platform → shows 'platform-dependent directory'", async () => {
    const skill = makeSkillSummary({ platform: "universal" });
    mockFetch.mockResolvedValue(makeOkResponse(skill));

    const handler = capturedTools.get("generate_install_command")!;
    const result = await handler({ skill_id: "uuid-001" });
    const text = extractText(result);

    expect(text).toContain("platform-dependent directory");
  });

  it("uses provided version instead of latest_version", async () => {
    const skill = makeSkillSummary({ latest_version: "1.0.0" });
    mockFetch.mockResolvedValue(makeOkResponse(skill));

    const handler = capturedTools.get("generate_install_command")!;
    const result = await handler({ skill_id: "uuid-001", version: "2.0.0" });
    const text = extractText(result);

    expect(text).toContain("author/my-skill@2.0.0");
  });

  it("appends --accept-risk flag when accept_risk is true", async () => {
    const skill = makeSkillSummary();
    mockFetch.mockResolvedValue(makeOkResponse(skill));

    const handler = capturedTools.get("generate_install_command")!;
    const result = await handler({ skill_id: "uuid-001", accept_risk: true });
    const text = extractText(result);

    expect(text).toContain("--accept-risk");
  });
});

// ============================================================
// suggest_skills tool
// ============================================================
describe("suggest_skills tool", () => {
  it("returns 'No skills found' message when data is empty", async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse({ data: [], keywords: [], total: 0 })
    );

    const handler = capturedTools.get("suggest_skills")!;
    const result = await handler({ description: "unknown task" });
    const text = extractText(result);

    expect(text).toContain("No skills found matching");
    expect(text).toContain("unknown task");
  });

  it("returns numbered list of results with install commands", async () => {
    const skillWithCmd = {
      ...makeSkillSummary(),
      install_command: "skillport install author/my-skill@1.0.0",
    };
    mockFetch.mockResolvedValue(
      makeOkResponse({ data: [skillWithCmd], keywords: ["ci", "devtools"], total: 1 })
    );

    const handler = capturedTools.get("suggest_skills")!;
    const result = await handler({ description: "set up CI/CD" });
    const text = extractText(result);

    expect(text).toContain("1. **My Skill**");
    expect(text).toContain("skillport install author/my-skill@1.0.0");
    expect(text).toContain("Keywords: ci, devtools");
  });

  it("includes platform filter in URL when provided", async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse({ data: [], keywords: [], total: 0 })
    );

    const handler = capturedTools.get("suggest_skills")!;
    await handler({ description: "automate deploys", platform: "claude-code" });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("platform=claude-code");
  });
});

// ============================================================
// check_policy tool
// ============================================================
describe("check_policy tool", () => {
  it("returns guidance text referencing the action name", async () => {
    const handler = capturedTools.get("check_policy")!;
    const result = await handler({ action: "install" });
    const text = extractText(result);

    expect(text).toContain("Policy Check: install");
    expect(text).toContain("POLICY_REJECTED");
    expect(text).toContain("exit code 32");
  });

  it("does not call fetch (pure local logic)", async () => {
    const handler = capturedTools.get("check_policy")!;
    await handler({ action: "publish" });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ============================================================
// plan_install tool
// ============================================================
describe("plan_install tool", () => {
  it("returns plan output with skill_id and version when version provided", async () => {
    const handler = capturedTools.get("plan_install")!;
    const result = await handler({ skill_id: "author/my-skill", version: "2.0.0" });
    const text = extractText(result);

    expect(text).toContain("Plan: install author/my-skill@2.0.0");
    expect(text).toContain("skillport plan author/my-skill@2.0.0 --json");
    expect(text).toContain("skillport install author/my-skill@2.0.0 --yes");
    expect(text).toContain("skillport uninstall author/my-skill --yes");
  });

  it("omits version suffix when version is not provided", async () => {
    const handler = capturedTools.get("plan_install")!;
    const result = await handler({ skill_id: "author/my-skill" });
    const text = extractText(result);

    expect(text).toContain("Plan: install author/my-skill\n");
    expect(text).toContain("skillport plan author/my-skill --json");
  });

  it("does not call fetch (pure local logic)", async () => {
    const handler = capturedTools.get("plan_install")!;
    await handler({ skill_id: "author/my-skill" });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ============================================================
// inspect_skill tool
// ============================================================
describe("inspect_skill tool", () => {
  it("returns structured skill metadata", async () => {
    const skill = makeSkillSummary({
      versions: [
        {
          id: "v1",
          version: "1.0.0",
          scan_passed: true,
          risk_score: 0,
          platform_signed: true,
          created_at: "2024-01-01T00:00:00Z",
          manifest: {
            declared_risk: "low",
            inputs: [
              { name: "token", type: "string", description: "API token", required: true },
            ],
            outputs: [
              { name: "result", type: "string", description: "Output text" },
            ],
            scope: { network: true },
            estimated_duration_seconds: 30,
            estimated_tokens: 1000,
          },
        },
      ],
    });
    mockFetch.mockResolvedValue(makeOkResponse(skill));

    const handler = capturedTools.get("inspect_skill")!;
    const result = await handler({ skill_id: "uuid-001" });
    const text = extractText(result);

    expect(text).toContain("# My Skill");
    expect(text).toContain("**Declared Risk:** low");
    expect(text).toContain("## Inputs");
    expect(text).toContain("token");
    expect(text).toContain("## Outputs");
    expect(text).toContain("result");
    expect(text).toContain("## Scope");
    expect(text).toContain("network");
    expect(text).toContain("Duration: ~30s");
    expect(text).toContain("Tokens: ~1000");
  });

  it("omits optional sections when manifest has no inputs/outputs/scope", async () => {
    const skill = makeSkillSummary({
      versions: [
        {
          id: "v1",
          version: "1.0.0",
          scan_passed: false,
          risk_score: 10,
          platform_signed: false,
          created_at: "2024-01-01T00:00:00Z",
          manifest: {},
        },
      ],
    });
    mockFetch.mockResolvedValue(makeOkResponse(skill));

    const handler = capturedTools.get("inspect_skill")!;
    const result = await handler({ skill_id: "uuid-001" });
    const text = extractText(result);

    expect(text).not.toContain("## Inputs");
    expect(text).not.toContain("## Outputs");
    expect(text).not.toContain("## Scope");
    expect(text).not.toContain("## Estimates");
  });
});

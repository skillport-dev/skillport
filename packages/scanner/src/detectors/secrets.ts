import type { Detector, DetectorPattern } from "./types.js";

function shannonEntropy(str: string): number {
  const freq = new Map<string, number>();
  for (const ch of str) {
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }
  let entropy = 0;
  const len = str.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const patterns: DetectorPattern[] = [
  {
    id: "SEC001",
    regex: /AKIA[0-9A-Z]{16}/,
    category: "secret",
    severity: "critical",
    message: "AWS Access Key ID detected",
    remediation: "Remove the key and rotate it in AWS IAM console",
  },
  {
    id: "SEC002",
    regex: /\b(ghp_|gho_|ghs_|ghr_)[A-Za-z0-9_]{36,}/,
    category: "secret",
    severity: "critical",
    message: "GitHub token detected",
    remediation: "Revoke the token and generate a new one",
  },
  {
    id: "SEC003",
    regex: /\b(sk_live_|pk_live_|rk_live_)[A-Za-z0-9]+/,
    category: "secret",
    severity: "critical",
    message: "Stripe live key detected",
    remediation: "Rotate the key in Stripe Dashboard",
  },
  {
    id: "SEC004",
    regex: /\b(sk-[A-Za-z0-9]{20,})/,
    category: "secret",
    severity: "critical",
    message: "OpenAI API key detected",
    remediation: "Rotate the key in OpenAI dashboard",
  },
  {
    id: "SEC005",
    regex: /xoxb-[0-9]{10,}-[A-Za-z0-9]+/,
    category: "secret",
    severity: "critical",
    message: "Slack bot token detected",
    remediation: "Revoke the token in Slack App settings",
  },
  {
    id: "SEC006",
    regex: /-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/,
    category: "secret",
    severity: "critical",
    message: "Private key detected",
    remediation: "Remove the private key from the package",
  },
  {
    id: "SEC007",
    regex: /\b(api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|secret[_-]?key)\s*[:=]\s*['"`]([A-Za-z0-9+/=_-]{20,})['"`]/i,
    category: "secret",
    severity: "high",
    message: "Potential API key or secret hardcoded",
    remediation: "Use environment variables or required_inputs instead",
  },
  {
    id: "SEC008",
    regex: /password\s*[:=]\s*['"`]([^'"`]{4,})['"`]/i,
    category: "secret",
    severity: "high",
    message: "Hardcoded password detected",
    remediation: "Use environment variables or required_inputs instead",
  },
  {
    id: "SEC009",
    regex: /['"`]([A-Za-z0-9+/=_-]{40,})['"`]/,
    category: "secret",
    severity: "medium",
    message: "High-entropy string detected (possible secret)",
    filter: (_match, _line) => {
      const str = _match[1];
      if (!str) return false;
      return shannonEntropy(str) >= 4.5;
    },
    remediation: "Verify this string is not a secret; if it is, use required_inputs",
  },
];

export const secretsDetector: Detector = {
  name: "secrets",
  patterns,
};

export { shannonEntropy };

import type { Detector, DetectorPattern } from "./types.js";

const patterns: DetectorPattern[] = [
  {
    id: "NET001",
    regex: /\bfetch\s*\(\s*['"`](https?:\/\/[^'"`\s]+)['"`]/,
    category: "network",
    severity: "medium",
    message: "External HTTP request via fetch()",
    filter: (match) => {
      const url = match[1];
      if (!url) return true;
      return !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url);
    },
    remediation: "Declare the domain in permissions.network.domains",
  },
  {
    id: "NET002",
    regex: /\brequire\s*\(\s*['"`](https?|node:https?)['"`]\s*\)/,
    category: "network",
    severity: "low",
    message: "HTTP/HTTPS module import detected",
    remediation: "Declare network usage in permissions.network",
  },
  {
    id: "NET003",
    regex: /\bhttps?\.request\s*\(/,
    category: "network",
    severity: "medium",
    message: "Direct HTTP request detected",
    remediation: "Declare the domain in permissions.network.domains",
  },
  {
    id: "NET004",
    regex: /new\s+WebSocket\s*\(\s*['"`](wss?:\/\/[^'"`\s]+)['"`]/,
    category: "network",
    severity: "medium",
    message: "WebSocket connection detected",
    remediation: "Declare the domain in permissions.network.domains",
  },
  {
    id: "NET005",
    regex: /\baxios\b|\bsuperagent\b|\bgot\b|\bnode-fetch\b|\bundici\b/,
    category: "network",
    severity: "low",
    message: "HTTP client library usage detected",
    remediation: "Declare network usage in permissions.network",
  },
];

export function extractDomains(content: string): string[] {
  const urlRegex = /https?:\/\/([a-zA-Z0-9.-]+)/g;
  const domains = new Set<string>();
  let match;
  while ((match = urlRegex.exec(content)) !== null) {
    const domain = match[1];
    if (domain !== "localhost" && domain !== "127.0.0.1") {
      domains.add(domain);
    }
  }
  return Array.from(domains);
}

export const networkDetector: Detector = {
  name: "network",
  patterns,
};

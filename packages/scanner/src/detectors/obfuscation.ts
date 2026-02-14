import type { Detector, DetectorPattern } from "./types.js";

const patterns: DetectorPattern[] = [
  {
    id: "OBF001",
    regex: /\batob\s*\(/,
    category: "obfuscation",
    severity: "medium",
    message: "Base64 decoding (atob) detected",
    remediation: "Use plain text instead of Base64-encoded strings",
  },
  {
    id: "OBF002",
    regex: /\bBuffer\.from\s*\([^,]+,\s*['"`]base64['"`]\s*\)/,
    category: "obfuscation",
    severity: "medium",
    message: "Buffer.from base64 decoding detected",
    remediation: "Use plain text instead of Base64-encoded data",
  },
  {
    id: "OBF003",
    regex: /(?:\\x[0-9a-fA-F]{2}){8,}/,
    category: "obfuscation",
    severity: "high",
    message: "Hex-escaped string sequence detected",
    remediation: "Use readable string literals instead of hex escapes",
  },
  {
    id: "OBF004",
    regex: /[A-Za-z0-9+/]{100,}={0,2}/,
    category: "obfuscation",
    severity: "medium",
    message: "Long Base64-like string detected (100+ chars)",
    remediation: "Ensure this is not obfuscated code or data",
  },
  {
    id: "OBF005",
    regex: /String\.fromCharCode\s*\(\s*(\d+\s*,\s*){5,}/,
    category: "obfuscation",
    severity: "high",
    message: "String.fromCharCode with many arguments — possible obfuscation",
    remediation: "Use readable string literals",
  },
  {
    id: "OBF006",
    regex: /\bunescape\s*\(\s*['"`]%/,
    category: "obfuscation",
    severity: "medium",
    message: "URL-encoded string decoding detected",
    remediation: "Use readable string literals",
  },
];

export const obfuscationDetector: Detector = {
  name: "obfuscation",
  patterns,
};

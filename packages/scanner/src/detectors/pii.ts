import type { Detector, DetectorPattern } from "./types.js";

const EXAMPLE_EMAIL_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "localhost",
  "placeholder.com",
];

function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

const patterns: DetectorPattern[] = [
  {
    id: "PII001",
    regex: /(\/Users\/[a-zA-Z0-9._-]+|\/home\/[a-zA-Z0-9._-]+|C:\\Users\\[a-zA-Z0-9._-]+)/,
    category: "pii",
    severity: "medium",
    message: "User home directory path detected",
    remediation: "Replace with relative paths or use ~ placeholder",
  },
  {
    id: "PII002",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    category: "pii",
    severity: "low",
    message: "Email address detected",
    filter: (match) => {
      const email = match[0];
      return !EXAMPLE_EMAIL_DOMAINS.some((d) => email.endsWith(`@${d}`));
    },
    remediation: "Remove or anonymize the email address",
  },
  {
    id: "PII003",
    regex: /\b0[789]0-?\d{4}-?\d{4}\b/,
    category: "pii",
    severity: "medium",
    message: "Japanese phone number detected",
    remediation: "Remove the phone number",
  },
  {
    id: "PII004",
    regex: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    category: "pii",
    severity: "medium",
    message: "Phone number detected",
    remediation: "Remove the phone number",
  },
  {
    id: "PII005",
    regex: /\b(?:\d[ -]*?){13,19}\b/,
    category: "pii",
    severity: "critical",
    message: "Credit card number detected (Luhn-verified)",
    filter: (match) => luhnCheck(match[0]),
    remediation: "Remove the credit card number immediately",
  },
  {
    id: "PII006",
    regex: /\b(?!10\.)(?!172\.(?:1[6-9]|2\d|3[01])\.)(?!192\.168\.)(?!127\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
    category: "pii",
    severity: "low",
    message: "Public IP address detected",
    remediation: "Remove or anonymize the IP address",
  },
];

export const piiDetector: Detector = {
  name: "pii",
  patterns,
};

export { luhnCheck };

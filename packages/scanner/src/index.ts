// Detectors
export { secretsDetector, shannonEntropy } from "./detectors/secrets.js";
export { dangerousDetector } from "./detectors/dangerous.js";
export { piiDetector, luhnCheck } from "./detectors/pii.js";
export { obfuscationDetector } from "./detectors/obfuscation.js";
export { networkDetector, extractDomains } from "./detectors/network.js";
export type {
  ScanIssue,
  IssueSeverity,
  IssueCategory,
  Detector,
  DetectorPattern,
} from "./detectors/types.js";

// Engine
export {
  scanFileContent,
  scanFiles,
  isScannable,
  SCANNABLE_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_ZIP_SIZE,
} from "./engine/scanner.js";
export type { ScanFilesResult } from "./engine/scanner.js";

// Report
export {
  generateReport,
  SCANNER_VERSION,
} from "./report/report.js";
export type { ScanReport } from "./report/report.js";

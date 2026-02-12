import type { Manifest } from "@skillport/core";
import type { ScanReport } from "@skillport/scanner";
import type { SkillCategory, SkillPlatform, SkillStatus, VersionStatus, ReportReason, ReportStatus } from "./constants.js";

// ---- Auth ----
export interface TokenExchangeRequest {
  supabase_jwt: string;
}

export interface TokenResponse {
  token: string;
  expires_at: string;
}

export interface CLITokenRequest {
  label: string;
  scopes: string[];
}

// ---- Skills ----
export interface SkillListQuery {
  q?: string;
  category?: SkillCategory;
  platform?: SkillPlatform | "all";
  os?: string;
  min_rating?: number;
  max_price?: number;
  sort?: "popular" | "recent" | "rating" | "price";
  page?: number;
  per_page?: number;
}

export interface SkillSummary {
  id: string;
  ssp_id: string;
  title: string;
  description: string;
  author: { username: string; display_name: string };
  price: number;
  category: SkillCategory;
  platform: SkillPlatform;
  tags: string[];
  latest_version: string;
  risk_score: number;
  danger_flag_count: number;
  os_compat: string[];
  avg_rating: number;
  review_count: number;
  downloads: number;
  status: SkillStatus;
}

export interface SkillDetail extends SkillSummary {
  manifest: Manifest;
  versions: VersionSummary[];
}

export interface VersionSummary {
  id: string;
  version: string;
  changelog: string;
  scan_passed: boolean;
  risk_score: number;
  platform_signed: boolean;
  status: VersionStatus;
  created_at: string;
}

export interface VersionDetail extends VersionSummary {
  manifest: Manifest;
  scan_report: ScanReport;
}

// ---- Downloads ----
export interface DownloadResponse {
  url: string;
  expires_at: string;
}

// ---- Purchases ----
export interface PurchaseRequest {
  skill_id: string;
  version_id?: string;
}

export type PurchaseResponse =
  | { id: string; entitled: true }
  | { checkout_url: string };

export interface EntitlementCheck {
  entitled: boolean;
  purchased_at?: string;
}

// ---- Reviews ----
export interface Review {
  id: string;
  skill_id: string;
  reviewer: { username: string; display_name: string };
  rating: number;
  comment: string;
  created_at: string;
}

export interface CreateReviewRequest {
  rating: number;
  comment: string;
}

// ---- Keys ----
export interface RegisterKeyRequest {
  public_key_pem: string;
  label: string;
}

export interface RegisteredKey {
  id: string;
  key_id: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

// ---- Pagination ----
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// ---- Reports ----
export interface CreateReportRequest {
  reason: ReportReason;
  comment?: string;
}

export interface ReportSummary {
  id: string;
  skill_id: string;
  reporter_id: string;
  reason: ReportReason;
  status: ReportStatus;
  created_at: string;
  skills?: { id: string; title: string; ssp_id: string };
  profiles?: { username: string; display_name: string };
}

export interface ReportDetail extends ReportSummary {
  comment: string;
  admin_notes: string;
  resolved_by: string | null;
  updated_at: string;
}

export interface UpdateReportRequest {
  status?: ReportStatus;
  admin_notes?: string;
}

// ---- Error ----
export interface APIError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

#!/usr/bin/env bash
# verify-publish.sh — End-to-end publish flow verification
#
# Prerequisites:
#   pnpm build          (builds all packages + CLI)
#   skillport login     (authenticates with marketplace)
#   skillport init      (generates signing keys, if not already done)
#
# Usage:
#   bash scripts/verify-publish.sh [path-to-skill-dir]
#
# If no skill dir is provided, uses the sample-skill fixture.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="node ${REPO_ROOT}/apps/cli/dist/index.js"
SKILL_DIR="${1:-${REPO_ROOT}/apps/cli/test-fixtures/sample-skill}"
TIMESTAMP="$(date +%s)"
SSP_PATH="/tmp/verify-publish-${TIMESTAMP}.ssp"

echo "=== SkillPort Publish Verification ==="
echo "Skill dir:  ${SKILL_DIR}"
echo "SSP output: ${SSP_PATH}"
echo ""

# Step 1: Export
echo "--- Step 1: Export ---"
$CLI export "${SKILL_DIR}" \
  -o "${SSP_PATH}" \
  --yes \
  --id "yu/verify-test" \
  --name "Verify Test" \
  --description "Publish verification test" \
  --skill-version "0.0.${TIMESTAMP}" \
  --author "Yu" \
  --openclaw-compat ">=1.0.0" \
  --os macos --os linux --os windows
echo ""

# Step 2: Verify locally
echo "--- Step 2: Verify ---"
$CLI verify "${SSP_PATH}"
echo ""

# Step 3: Dry-run
echo "--- Step 3: Dry-run ---"
$CLI dry-run "${SSP_PATH}"
echo ""

# Step 4: Publish
echo "--- Step 4: Publish ---"
$CLI publish "${SSP_PATH}"
echo ""

# Step 5: Install (optional — uncomment if API is running)
# echo "--- Step 5: Install ---"
# $CLI install "yu/verify-test@0.0.${TIMESTAMP}" --yes
# echo ""

# Cleanup
rm -f "${SSP_PATH}"
echo "=== Done ==="

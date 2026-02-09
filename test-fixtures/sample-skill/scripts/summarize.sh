#!/bin/bash
# Git Summary Reporter - generates a summary of recent commits

REPO_PATH="${1:-.}"
COUNT="${2:-10}"

cd "$REPO_PATH" || exit 1

echo "## Recent Commits"
echo ""
echo "| Hash | Author | Date | Message |"
echo "|------|--------|------|---------|"

git log --pretty=format:"| %h | %an | %ad | %s |" --date=short -n "$COUNT"
echo ""

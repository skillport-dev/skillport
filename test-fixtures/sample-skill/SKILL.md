# Git Summary Reporter

A skill that generates a summary of recent git commits in a repository.

## Usage

Run this skill in any git repository to get a formatted summary of the last 10 commits.

## Input

- `repo_path` (optional): Path to the git repository (defaults to current directory)
- `count` (optional): Number of commits to summarize (defaults to 10)

## Output

A markdown-formatted summary including:
- Commit hash (short)
- Author name
- Date
- Commit message

## Example

```
## Recent Commits

| Hash | Author | Date | Message |
|------|--------|------|---------|
| a1b2c3d | Alice | 2024-01-15 | Add login feature |
| e4f5g6h | Bob | 2024-01-14 | Fix typo in docs |
```

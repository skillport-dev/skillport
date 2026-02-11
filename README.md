# SkillPort

Secure skill distribution for [OpenClaw](https://openclaw.dev) / ClawHub.

| Component | Description |
|-----------|-------------|
| `apps/cli` | `skillport` CLI — export, scan, sign, publish, install |
| `apps/api` | Hono API server (api.skillport.market) |
| `apps/web` | Next.js 16 marketplace (skillport.market) |
| `packages/core` | Manifest schema, archive, crypto (Ed25519), permissions |
| `packages/scanner` | Security scanner (5 detectors) |
| `packages/shared` | API types & constants |
| `packages/mcp` | MCP Server for AI agent integration |

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

### CLI (local development)

```bash
node apps/cli/dist/index.js --help
```

### CLI (global install from source)

```bash
cd apps/cli && pnpm build && npm pack
npm install -g skillport-cli-*.tgz
skillport --help
```

## npm Publishing & dist-tags

The CLI package (`@skillport/cli`) is published to npm.

### Current policy

| Tag | Purpose | When to use |
|-----|---------|-------------|
| `beta` | Pre-release builds | Default — all `npm publish` from this repo use `beta` via `publishConfig.tag` |
| `latest` | Stable release | Only promote manually after verification |

**Why `beta` is the default:**
The project is pre-1.0. Publishing to `latest` by default risks users running `npm install -g @skillport/cli` and getting an untested build. By defaulting to `beta`, users must opt in with `npm install -g @skillport/cli@beta`.

### Publishing a new beta

```bash
cd apps/cli
# Bump version in package.json
pnpm build
npm publish          # publishes as @beta (via publishConfig)
```

### Promoting beta to latest

After verifying a beta build works (use `scripts/verify-publish.sh`):

```bash
# Check current tags
npm dist-tag ls @skillport/cli

# Promote a specific version to latest
npm dist-tag add @skillport/cli@0.1.6 latest
```

### Checking what users get

```bash
npm info @skillport/cli dist-tags   # shows all tags
npm info @skillport/cli version     # shows what "latest" resolves to
```

## Publish Verification

Run the end-to-end publish test script:

```bash
bash scripts/verify-publish.sh [path-to-skill-dir]
```

This runs: export → verify → dry-run → publish, using a timestamped version to avoid collisions.

## Development

```bash
pnpm build           # build all packages (turbo)
pnpm test            # run all tests
pnpm --filter @skillport/cli test    # CLI tests only
pnpm --filter @skillport/web build   # web build
```

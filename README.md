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

## Install CLI

```bash
npm install -g @skillport/cli
skillport --help
```

## Quick Start (development)

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

## npm Publishing

The CLI package (`@skillport/cli`) is published to npm with `publishConfig.tag: "latest"`.

```bash
cd apps/cli
# Bump version in package.json + src/index.ts
pnpm build
npm publish
```

### Checking what users get

```bash
npm info @skillport/cli dist-tags
npm info @skillport/cli version
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

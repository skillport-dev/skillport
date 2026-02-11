# SkillPort

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@skillport/cli)](https://www.npmjs.com/package/@skillport/cli)

Secure skill distribution for [OpenClaw](https://openclaw.dev) / ClawHub.

| Package | Description |
|---------|-------------|
| `apps/cli` | `skillport` CLI — export, scan, sign, publish, install |
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

## Marketplace

The hosted marketplace is available at [skillport.market](https://skillport.market).

## Development

```bash
pnpm build           # build all packages (turbo)
pnpm test            # run all tests
pnpm --filter @skillport/cli test    # CLI tests only
```

## License

[MIT](LICENSE)

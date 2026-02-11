import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "dist/index.js",
  external: [
    "chalk",
    "commander",
    "inquirer",
    "ora",
    "zod",
    "jszip",
  ],
});

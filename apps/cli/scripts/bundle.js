import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "dist/index.js",
  minify: true,
  keepNames: true,
  external: [
    "chalk",
    "commander",
    "inquirer",
    "zod",
  ],
});

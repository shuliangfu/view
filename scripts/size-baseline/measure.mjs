#!/usr/bin/env node
/**
 * Bundle-size baseline for @dreamer/view entries.
 *
 * Tool: esbuild 0.27.x (resolved from this repo's node_modules via @dreamer/esbuild).
 * Method: bundle each entry as ESM, tree-shake enabled, mark non-view packages external,
 * report raw / minify / gzip sizes. Reproducible command:
 *
 *   node scripts/size-baseline/measure.mjs
 *   # or: deno task size:baseline
 *
 * Outputs JSON + markdown table to stdout; writes analysis/bundle-size-baseline.json
 * when --write is passed.
 */
import * as esbuild from "esbuild";
import { createGzip } from "node:zlib";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const write = process.argv.includes("--write");

const ENTRIES = [
  { name: "@dreamer/view", path: "scripts/size-baseline/entry-main.ts", exportPath: "." },
  { name: "@dreamer/view/reactivity", path: "scripts/size-baseline/entry-reactivity.ts", exportPath: "./reactivity" },
  { name: "@dreamer/view/csr", path: "scripts/size-baseline/entry-csr.ts", exportPath: "./csr" },
  { name: "@dreamer/view/ssr", path: "scripts/size-baseline/entry-ssr.ts", exportPath: "./ssr" },
  { name: "@dreamer/view/router", path: "scripts/size-baseline/entry-router.ts", exportPath: "./router" },
  { name: "@dreamer/view/form", path: "scripts/size-baseline/entry-form.ts", exportPath: "./form" },
  { name: "@dreamer/view/resource", path: "scripts/size-baseline/entry-resource.ts", exportPath: "./resource" },
];

/** Packages that are not view source — keep external so sizes compare view code only. */
const external = [
  "@dreamer/*",
  "happy-dom",
  "typescript",
  "cssnano",
  "node:*",
  "npm:*",
];

function fmt(n) {
  return `${(n / 1024).toFixed(2)} KiB`;
}

async function measureOne(entry) {
  const abs = join(root, entry.path);
  const common = {
    entryPoints: [abs],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    logLevel: "silent",
    // Keep view-local .ts resolvable; leave peer pkgs out of the byte count.
    packages: "external",
    // Also mark bare @dreamer/* just in case packages:external misses jsr aliases
    external: [
      "@dreamer/console",
      "@dreamer/runtime-adapter",
      "@dreamer/esbuild",
      "@dreamer/logger",
      "@dreamer/plugin",
      "@dreamer/plugins",
      "@dreamer/server",
      "@dreamer/service",
      "@dreamer/i18n",
      "happy-dom",
      "typescript",
      "cssnano",
    ],
    metafile: true,
  };

  const raw = await esbuild.build({ ...common, minify: false });
  const min = await esbuild.build({ ...common, minify: true });
  const rawBytes = raw.outputFiles[0].contents.byteLength;
  const minBytes = min.outputFiles[0].contents.byteLength;
  const gzBytes = gzipSync(min.outputFiles[0].contents, { level: 9 }).byteLength;

  // Count view src modules in the metafile (paths are repo-relative)
  const inputs = Object.keys(min.metafile.inputs).filter((p) =>
    /(^|[\\/])src[\\/]/.test(p)
  );

  return {
    name: entry.name,
    exportPath: entry.exportPath,
    entry: entry.path,
    rawBytes,
    minBytes,
    gzipMinBytes: gzBytes,
    rawKiB: +(rawBytes / 1024).toFixed(2),
    minKiB: +(minBytes / 1024).toFixed(2),
    gzipMinKiB: +(gzBytes / 1024).toFixed(2),
    inputFileCount: inputs.length,
  };
}

const started = new Date().toISOString();
const rows = [];
for (const e of ENTRIES) {
  rows.push(await measureOne(e));
}

const tool = {
  bundler: "esbuild",
  esbuildVersion: esbuild.version,
  command: "node scripts/size-baseline/measure.mjs [--write]",
  denoTask: "deno task size:baseline",
  notes: [
    "packages:external + explicit @dreamer/* externals — sizes are view source only",
    "platform:neutral ESM; minify via esbuild; gzip = zlib level 9 of minified",
    "Apple Silicon / Deno host independent: this script is Node+esbuild",
  ],
};

const report = {
  package: "@dreamer/view",
  version: JSON.parse(readFileSync(join(root, "deno.json"), "utf8")).version,
  measuredAt: started,
  tool,
  entries: rows,
};

console.log("\n# @dreamer/view bundle size baseline\n");
console.log(`measuredAt: ${started}`);
console.log(`esbuild: ${esbuild.version}`);
console.log(`version: ${report.version}\n`);
console.log(
  "| entry | raw | minify | gzip(min) | #src files |",
);
console.log("|---|---:|---:|---:|---:|");
for (const r of rows) {
  console.log(
    `| \`${r.name}\` | ${fmt(r.rawBytes)} | ${fmt(r.minBytes)} | ${fmt(r.gzipMinBytes)} | ${r.inputFileCount} |`,
  );
}
console.log("");

if (write) {
  const outJson = join(root, "analysis/bundle-size-baseline.json");
  writeFileSync(outJson, JSON.stringify(report, null, 2) + "\n");
  console.log(`wrote ${outJson}`);
}

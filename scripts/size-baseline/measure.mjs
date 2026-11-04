#!/usr/bin/env node
/**
 * Bundle-size baseline for @dreamer/view entries.
 *
 * Tool: esbuild 0.27.x (resolved from this repo's node_modules via @dreamer/esbuild).
 * Method: bundle each entry as ESM, tree-shake enabled, mark non-view packages external,
 * report raw / minify / gzip sizes. Reproducible command:
 *
 *   node scripts/size-baseline/measure.mjs
 *   node scripts/size-baseline/measure.mjs --write   # refresh committed baseline JSON
 *   # or: deno task size:baseline
 *
 * Outputs JSON + markdown table to stdout; with --write also writes
 * scripts/size-baseline/bundle-size-baseline.json (committed gate baseline).
 */
import * as esbuild from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const BASELINE_PATH = join(__dirname, "bundle-size-baseline.json");

export const ENTRIES = [
  {
    name: "@dreamer/view",
    path: "scripts/size-baseline/entry-main.ts",
    exportPath: ".",
  },
  {
    name: "@dreamer/view/reactivity",
    path: "scripts/size-baseline/entry-reactivity.ts",
    exportPath: "./reactivity",
  },
  {
    name: "@dreamer/view/csr",
    path: "scripts/size-baseline/entry-csr.ts",
    exportPath: "./csr",
  },
  {
    name: "@dreamer/view/ssr",
    path: "scripts/size-baseline/entry-ssr.ts",
    exportPath: "./ssr",
  },
  {
    name: "@dreamer/view/router",
    path: "scripts/size-baseline/entry-router.ts",
    exportPath: "./router",
  },
  {
    name: "@dreamer/view/form",
    path: "scripts/size-baseline/entry-form.ts",
    exportPath: "./form",
  },
  {
    name: "@dreamer/view/resource",
    path: "scripts/size-baseline/entry-resource.ts",
    exportPath: "./resource",
  },
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
    packages: "external",
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
  const gzBytes =
    gzipSync(min.outputFiles[0].contents, { level: 9 }).byteLength;

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

export async function measureAll() {
  const rows = [];
  for (const e of ENTRIES) {
    rows.push(await measureOne(e));
  }
  const started = new Date().toISOString();
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
  return {
    package: "@dreamer/view",
    version: JSON.parse(readFileSync(join(root, "deno.json"), "utf8")).version,
    measuredAt: started,
    tool,
    entries: rows,
  };
}

export function printTable(report) {
  console.log("\n# @dreamer/view bundle size baseline\n");
  console.log(`measuredAt: ${report.measuredAt}`);
  console.log(`esbuild: ${report.tool.esbuildVersion}`);
  console.log(`version: ${report.version}\n`);
  console.log("| entry | raw | minify | gzip(min) | #src files |");
  console.log("|---|---:|---:|---:|---:|");
  for (const r of report.entries) {
    console.log(
      `| \`${r.name}\` | ${fmt(r.rawBytes)} | ${fmt(r.minBytes)} | ${
        fmt(r.gzipMinBytes)
      } | ${r.inputFileCount} |`,
    );
  }
  console.log("");
}

export { BASELINE_PATH, root };

const isMain = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const write = process.argv.includes("--write");
  const report = await measureAll();
  printTable(report);
  if (write) {
    writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2) + "\n");
    console.log(`wrote ${BASELINE_PATH}`);
  }
}

#!/usr/bin/env node
/**
 * Consumer / examples bundle analyze for @dreamer/view.
 *
 * Contrasts convenience-barrel imports vs focused subpaths for the same
 * named export sets (consumer fixtures). Reports raw / minify / gzip and
 * paired barrel premiums. Independent of scripts/size-baseline/ (library
 * entry gate) — does NOT relax that baseline.
 *
 *   node scripts/consumer-bundle/measure.mjs
 *   node scripts/consumer-bundle/measure.mjs --write
 *   # or: deno task consumer:bundle:baseline
 */
import * as esbuild from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const BASELINE_PATH = join(__dirname, "consumer-bundle-baseline.json");

/** @typedef {{ name: string, path: string, role: string, pair?: string }} Entry */

/** @type {Entry[]} */
export const ENTRIES = [
  // --- named imports (esbuild + sideEffects:false usually shakes to ≈ subpath) ---
  {
    name: "barrel-reactivity-api",
    path: "scripts/consumer-bundle/fixtures/barrel-reactivity-api.ts",
    role: "barrel-named",
    pair: "subpath-reactivity-api",
  },
  {
    name: "subpath-reactivity-api",
    path: "scripts/consumer-bundle/fixtures/subpath-reactivity-api.ts",
    role: "subpath-named",
    pair: "barrel-reactivity-api",
  },
  {
    name: "barrel-csr-api",
    path: "scripts/consumer-bundle/fixtures/barrel-csr-api.ts",
    role: "barrel-named",
    pair: "subpath-csr-api",
  },
  {
    name: "subpath-csr-api",
    path: "scripts/consumer-bundle/fixtures/subpath-csr-api.ts",
    role: "subpath-named",
    pair: "barrel-csr-api",
  },
  {
    // 3.0: router left the main barrel; fixture imports `/router` (parity lock).
    name: "barrel-router-api",
    path: "scripts/consumer-bundle/fixtures/barrel-router-api.ts",
    role: "barrel-named",
    pair: "subpath-router-api",
  },
  {
    name: "subpath-router-api",
    path: "scripts/consumer-bundle/fixtures/subpath-router-api.ts",
    role: "subpath-named",
    pair: "barrel-router-api",
  },
  {
    name: "barrel-kitchen-sink",
    path: "scripts/consumer-bundle/fixtures/barrel-kitchen-sink.ts",
    role: "barrel-named",
    pair: "subpath-kitchen-sink",
  },
  {
    name: "subpath-kitchen-sink",
    path: "scripts/consumer-bundle/fixtures/subpath-kitchen-sink.ts",
    role: "subpath-named",
    pair: "barrel-kitchen-sink",
  },
  {
    name: "barrel-examples-surface",
    path: "scripts/consumer-bundle/fixtures/barrel-examples-surface.ts",
    role: "barrel-named",
    pair: "subpath-examples-surface",
  },
  {
    name: "subpath-examples-surface",
    path: "scripts/consumer-bundle/fixtures/subpath-examples-surface.ts",
    role: "subpath-named",
    pair: "barrel-examples-surface",
  },
  {
    name: "app-reexport-from-barrel",
    path: "scripts/consumer-bundle/fixtures/app-reexport-from-barrel.ts",
    role: "barrel-named",
    pair: "app-reexport-from-subpath",
  },
  {
    name: "app-reexport-from-subpath",
    path: "scripts/consumer-bundle/fixtures/app-reexport-from-subpath.ts",
    role: "subpath-named",
    pair: "app-reexport-from-barrel",
  },
  // --- star / namespace (real barrel premium) ---
  {
    name: "barrel-star-reexport",
    path: "scripts/consumer-bundle/fixtures/barrel-star-reexport.ts",
    role: "barrel-star",
    pair: "subpath-star-reactivity",
  },
  {
    name: "subpath-star-reactivity",
    path: "scripts/consumer-bundle/fixtures/subpath-star-reactivity.ts",
    role: "subpath-star",
    pair: "barrel-star-reexport",
  },
  {
    name: "subpath-star-csr",
    path: "scripts/consumer-bundle/fixtures/subpath-star-csr.ts",
    role: "subpath-star",
  },
  {
    name: "barrel-namespace-reactivity-api",
    path: "scripts/consumer-bundle/fixtures/barrel-namespace-reactivity-api.ts",
    role: "barrel-namespace",
    pair: "subpath-namespace-reactivity-api",
  },
  {
    name: "subpath-namespace-reactivity-api",
    path:
      "scripts/consumer-bundle/fixtures/subpath-namespace-reactivity-api.ts",
    role: "subpath-namespace",
    pair: "barrel-namespace-reactivity-api",
  },
  // --- examples main entry mirror ---
  {
    name: "examples-main-subpath",
    path: "scripts/consumer-bundle/fixtures/examples-main-subpath.ts",
    role: "examples-entry",
  },
];

const EXTERNAL = [
  "@dreamer/console",
  "@dreamer/runtime-adapter",
  "@dreamer/esbuild",
  "@dreamer/logger",
  "@dreamer/plugin",
  "@dreamer/plugins",
  "@dreamer/server",
  "@dreamer/service",
  "@dreamer/i18n",
  "@dreamer/image",
  "happy-dom",
  "typescript",
  "cssnano",
  "autoprefixer",
  "tailwindcss",
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
    external: EXTERNAL,
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
    role: entry.role,
    pair: entry.pair ?? null,
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

function buildComparisons(rows) {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const seen = new Set();
  const comparisons = [];
  for (const r of rows) {
    if (!String(r.role).startsWith("barrel") || !r.pair) continue;
    const key = [r.name, r.pair].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const sub = byName.get(r.pair);
    if (!sub) continue;
    const minDelta = r.minBytes - sub.minBytes;
    const gzDelta = r.gzipMinBytes - sub.gzipMinBytes;
    const minRatio = sub.minBytes === 0
      ? null
      : +(r.minBytes / sub.minBytes).toFixed(3);
    comparisons.push({
      pair: `${r.name} vs ${sub.name}`,
      barrel: r.name,
      subpath: sub.name,
      barrelMinBytes: r.minBytes,
      subpathMinBytes: sub.minBytes,
      barrelGzipMinBytes: r.gzipMinBytes,
      subpathGzipMinBytes: sub.gzipMinBytes,
      minifyPremiumBytes: minDelta,
      minifyPremiumKiB: +(minDelta / 1024).toFixed(2),
      gzipPremiumBytes: gzDelta,
      gzipPremiumKiB: +(gzDelta / 1024).toFixed(2),
      minifyRatioBarrelOverSubpath: minRatio,
    });
  }
  return comparisons;
}

export async function measureAll() {
  const rows = [];
  for (const e of ENTRIES) {
    rows.push(await measureOne(e));
  }
  const comparisons = buildComparisons(rows);
  const started = new Date().toISOString();
  const tool = {
    bundler: "esbuild",
    esbuildVersion: esbuild.version,
    command: "node scripts/consumer-bundle/measure.mjs [--write]",
    denoTask: "deno task consumer:bundle:baseline",
    notes: [
      "Named imports from barrel often tree-shake to ≈ subpath size under esbuild + sideEffects:false",
      "Star re-export / namespace import of the convenience barrel shows the real 全家桶 premium",
      "packages:external + explicit @dreamer/* externals — bytes are view src pulled by the import graph",
      "Independent of scripts/size-baseline/ library entry gate; does not relax that +5% budget",
      "examples-main-subpath mirrors examples/src/main.tsx view imports (already on /router)",
      "barrel-examples-surface vs subpath-examples-surface = examples API union (named)",
    ],
  };
  return {
    package: "@dreamer/view",
    kind: "consumer-bundle-analyze",
    version: JSON.parse(readFileSync(join(root, "deno.json"), "utf8")).version,
    measuredAt: started,
    tool,
    entries: rows,
    comparisons,
  };
}

export function printTable(report) {
  console.log("\n# @dreamer/view consumer / examples bundle analyze\n");
  console.log(`measuredAt: ${report.measuredAt}`);
  console.log(`esbuild: ${report.tool.esbuildVersion}`);
  console.log(`version: ${report.version}\n`);
  console.log("| fixture | role | raw | minify | gzip(min) | #src |");
  console.log("|---|---|---:|---:|---:|---:|");
  for (const r of report.entries) {
    console.log(
      `| \`${r.name}\` | ${r.role} | ${fmt(r.rawBytes)} | ${
        fmt(r.minBytes)
      } | ${fmt(r.gzipMinBytes)} | ${r.inputFileCount} |`,
    );
  }
  console.log("\n## Barrel premium (minify / gzip)\n");
  console.log(
    "| pair | barrel minify | subpath minify | Δ minify | Δ gzip | ratio |",
  );
  console.log("|---|---:|---:|---:|---:|---:|");
  for (const c of report.comparisons) {
    console.log(
      `| ${c.pair} | ${fmt(c.barrelMinBytes)} | ${fmt(c.subpathMinBytes)} | +${
        fmt(c.minifyPremiumBytes)
      } | +${fmt(c.gzipPremiumBytes)} | ${
        c.minifyRatioBarrelOverSubpath ?? "n/a"
      }× |`,
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

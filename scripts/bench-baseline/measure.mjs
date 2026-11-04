#!/usr/bin/env node
/**
 * Capture Deno bench JSON into a committed baseline for CI / local gates.
 *
 *   node scripts/bench-baseline/measure.mjs --write
 *   deno task bench:baseline
 *
 * Does not change runtime behavior. Probes never go into src/.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
export const BASELINE_PATH = join(__dirname, "bench-baseline.json");

export function runBenchJson() {
  const r = spawnSync(
    "deno",
    ["bench", "-A", "--json", "tests/bench/"],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (r.error) {
    console.error(r.error);
    process.exit(2);
  }
  if (r.status !== 0) {
    if (r.stderr) console.error(r.stderr);
    if (r.stdout) console.error(r.stdout.slice(0, 4000));
    console.error(`deno bench exited ${r.status}`);
    process.exit(r.status ?? 2);
  }
  // deno may print warnings before JSON; take last '{' … EOF object
  const out = r.stdout ?? "";
  const idx = out.lastIndexOf("\n{") >= 0
    ? out.lastIndexOf("\n{") + 1
    : out.indexOf("{");
  if (idx < 0) {
    console.error("No JSON object in deno bench --json output");
    process.exit(2);
  }
  return JSON.parse(out.slice(idx));
}

export function normalize(raw) {
  const entries = [];
  for (const b of raw.benches ?? []) {
    const ok = b.results?.[0]?.ok;
    if (!ok) {
      entries.push({
        name: b.name,
        origin: b.origin,
        error: b.results?.[0]?.failed ?? "missing ok result",
      });
      continue;
    }
    entries.push({
      name: b.name,
      origin: b.origin,
      avgNs: ok.avg,
      minNs: ok.min,
      maxNs: ok.max,
      p75Ns: ok.p75,
      n: ok.n,
    });
  }
  entries.sort((a, c) => a.name.localeCompare(c.name));
  return {
    version: 1,
    measuredAt: new Date().toISOString(),
    runtime: raw.runtime ?? null,
    cpu: raw.cpu ?? null,
    command: "deno bench -A --json tests/bench/",
    entries,
  };
}

export function printTable(doc) {
  console.log("name\tavgNs\tn");
  for (const e of doc.entries) {
    if (e.error) {
      console.log(`${e.name}\tERROR\t${e.error}`);
    } else {
      console.log(`${e.name}\t${Math.round(e.avgNs)}\t${e.n}`);
    }
  }
}

export function measureAll(write = false) {
  const raw = runBenchJson();
  const doc = normalize(raw);
  printTable(doc);
  if (write) {
    mkdirSync(dirname(BASELINE_PATH), { recursive: true });
    writeFileSync(BASELINE_PATH, JSON.stringify(doc, null, 2) + "\n");
    console.log(`\nWrote ${BASELINE_PATH}`);
  }
  return doc;
}

const isMain = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  measureAll(process.argv.includes("--write"));
}

#!/usr/bin/env node
/**
 * Bench CI / preflight gate for @dreamer/view.
 *
 * Runs `deno bench -A --json tests/bench/` and compares each bench **avgNs**
 * against `scripts/bench-baseline/bench-baseline.json`.
 *
 * Default budget: +100% over baseline avg (ceil). CI should set a looser
 * `BENCH_BUDGET_PCT` (workflow uses 300) because Actions runners ≠ reference CPU.
 *
 * Any missing / failed bench → exit 1. Catastrophic slowdowns over budget → exit 1.
 *
 *   node scripts/bench-baseline/check.mjs
 *   deno task bench:check
 *
 * Override: `--budget-pct 100` or env `BENCH_BUDGET_PCT`.
 * Smoke-only (no timing compare): `--smoke` or `BENCH_SMOKE=1`.
 */
import { readFileSync } from "node:fs";
import {
  BASELINE_PATH,
  normalize,
  printTable,
  runBenchJson,
} from "./measure.mjs";

function parseBudgetPct(argv) {
  if (argv.includes("--smoke") || process.env.BENCH_SMOKE === "1") {
    return null; // smoke = no timing gate
  }
  const env = process.env.BENCH_BUDGET_PCT;
  let pct = env != null && env !== "" ? Number(env) : 100;
  const idx = argv.indexOf("--budget-pct");
  if (idx >= 0 && argv[idx + 1] != null) {
    pct = Number(argv[idx + 1]);
  }
  if (!Number.isFinite(pct) || pct < 0) {
    console.error(`Invalid budget percent: ${pct}`);
    process.exit(2);
  }
  return pct;
}

function limitNs(baseline, pct) {
  return Math.ceil(baseline * (1 + pct / 100));
}

function pctDelta(current, baseline) {
  if (baseline === 0) return current === 0 ? 0 : Infinity;
  return ((current - baseline) / baseline) * 100;
}

const budgetPct = parseBudgetPct(process.argv);
const current = normalize(runBenchJson());
printTable(current);

const failures = [];
for (const e of current.entries) {
  if (e.error) {
    failures.push({ name: e.name, reason: String(e.error) });
  }
}

if (budgetPct == null) {
  console.log("\nSmoke mode: timing compare skipped.");
  if (failures.length) {
    console.error("\nBench failures:");
    for (const f of failures) console.error(`  - ${f.name}: ${f.reason}`);
    process.exit(1);
  }
  console.log("OK — all benches completed.");
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
console.log(`\nGate baseline: ${BASELINE_PATH}`);
console.log(`Baseline measuredAt: ${baseline.measuredAt}`);
console.log(`Baseline runtime: ${baseline.runtime}`);
console.log(`Budget: +${budgetPct}% over baseline avgNs\n`);

const byName = new Map(baseline.entries.map((e) => [e.name, e]));
const rows = [];

for (const cur of current.entries) {
  if (cur.error) continue;
  const base = byName.get(cur.name);
  if (!base || base.error) {
    failures.push({ name: cur.name, reason: "missing from baseline" });
    continue;
  }
  const lim = limitNs(base.avgNs, budgetPct);
  const ok = cur.avgNs <= lim;
  const delta = pctDelta(cur.avgNs, base.avgNs);
  rows.push({
    name: cur.name,
    avgNs: Math.round(cur.avgNs),
    limit: lim,
    delta,
    ok,
  });
  if (!ok) {
    failures.push({
      name: cur.name,
      reason:
        `avgNs ${Math.round(cur.avgNs)} > limit ${lim} (Δ${delta.toFixed(1)}%)`,
    });
  }
}

for (const base of baseline.entries) {
  if (!current.entries.some((e) => e.name === base.name)) {
    failures.push({ name: base.name, reason: "missing from current run" });
  }
}

console.log("name\tavgNs\tlimit\tdelta%\tok");
for (const r of rows) {
  console.log(
    `${r.name}\t${r.avgNs}\t${r.limit}\t${r.delta.toFixed(1)}\t${
      r.ok ? "ok" : "FAIL"
    }`,
  );
}

if (failures.length) {
  console.error("\nBench gate FAILED:");
  for (const f of failures) console.error(`  - ${f.name}: ${f.reason}`);
  process.exit(1);
}

console.log("\nOK — within budget.");

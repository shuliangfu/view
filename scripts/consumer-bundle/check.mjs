#!/usr/bin/env node
/**
 * Consumer-bundle CI / preflight gate (independent of size:check).
 *
 * Compares a fresh measure against
 * `scripts/consumer-bundle/consumer-bundle-baseline.json`.
 *
 * Budget (default): each fixture's **minify** and **gzip(min)** must stay
 * within **+5%** of the baseline bytes (ceil). Exceeding either → exit 1.
 *
 * Does **not** modify or relax `scripts/size-baseline/bundle-size-baseline.json`.
 *
 *   node scripts/consumer-bundle/check.mjs
 *   deno task consumer:bundle:check
 */
import { readFileSync } from "node:fs";
import { measureAll, printTable, BASELINE_PATH } from "./measure.mjs";

function parseBudgetPct(argv) {
  const env = process.env.CONSUMER_BUNDLE_BUDGET_PCT ?? process.env.SIZE_BUDGET_PCT;
  let pct = env != null && env !== "" ? Number(env) : 5;
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

function limitBytes(baseline, pct) {
  return Math.ceil(baseline * (1 + pct / 100));
}

function pctDelta(current, baseline) {
  if (baseline === 0) return current === 0 ? 0 : Infinity;
  return ((current - baseline) / baseline) * 100;
}

const budgetPct = parseBudgetPct(process.argv);
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const current = await measureAll();

printTable(current);

console.log(`Gate baseline: ${BASELINE_PATH}`);
console.log(`Baseline measuredAt: ${baseline.measuredAt}`);
console.log(`Budget: +${budgetPct}% over baseline minify / gzip(min)\n`);

const byName = new Map(baseline.entries.map((e) => [e.name, e]));
const failures = [];
const rows = [];

for (const cur of current.entries) {
  const base = byName.get(cur.name);
  if (!base) {
    failures.push({ name: cur.name, reason: "missing from baseline" });
    continue;
  }
  const minLimit = limitBytes(base.minBytes, budgetPct);
  const gzLimit = limitBytes(base.gzipMinBytes, budgetPct);
  const minOk = cur.minBytes <= minLimit;
  const gzOk = cur.gzipMinBytes <= gzLimit;
  const minDelta = pctDelta(cur.minBytes, base.minBytes);
  const gzDelta = pctDelta(cur.gzipMinBytes, base.gzipMinBytes);
  rows.push({
    name: cur.name,
    minBytes: cur.minBytes,
    minLimit,
    minDelta,
    minOk,
    gzipMinBytes: cur.gzipMinBytes,
    gzLimit,
    gzDelta,
    gzOk,
  });
  if (!minOk) {
    failures.push({
      name: cur.name,
      metric: "minify",
      current: cur.minBytes,
      baseline: base.minBytes,
      limit: minLimit,
      deltaPct: minDelta,
    });
  }
  if (!gzOk) {
    failures.push({
      name: cur.name,
      metric: "gzip(min)",
      current: cur.gzipMinBytes,
      baseline: base.gzipMinBytes,
      limit: gzLimit,
      deltaPct: gzDelta,
    });
  }
}

console.log(
  "| fixture | minify | limit | Δ% | gzip | limit | Δ% |",
);
console.log("|---|---:|---:|---:|---:|---:|---:|");
for (const r of rows) {
  const mark = (ok) => (ok ? "ok" : "FAIL");
  console.log(
    `| \`${r.name}\` | ${r.minBytes} ${mark(r.minOk)} | ${r.minLimit} | ${r.minDelta.toFixed(2)} | ${r.gzipMinBytes} ${mark(r.gzOk)} | ${r.gzLimit} | ${r.gzDelta.toFixed(2)} |`,
  );
}
console.log("");

if (failures.length) {
  console.error("Consumer bundle size gate FAILED:");
  for (const f of failures) {
    if (f.reason) {
      console.error(`  - ${f.name}: ${f.reason}`);
    } else {
      console.error(
        `  - ${f.name} ${f.metric}: ${f.current} B > limit ${f.limit} B (baseline ${f.baseline} B, Δ ${f.deltaPct.toFixed(2)}%)`,
      );
    }
  }
  console.error(
    "\nIf growth is intentional, refresh the baseline:\n  deno task consumer:bundle:baseline\nthen commit scripts/consumer-bundle/consumer-bundle-baseline.json",
  );
  process.exit(1);
}

console.log(`Consumer bundle size gate PASSED (+${budgetPct}% budget).`);
process.exit(0);

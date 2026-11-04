/**
 * Compiler coverage / golden gate for @dreamer/view.
 *
 * Recompiles the corpus, compares metrics to the committed baseline, and
 * compares full normalized output to committed goldens under ./goldens/.
 *
 * Fail if:
 *   - any fixture missing from baseline / golden
 *   - any metric field differs (exact lock — intentional change → --write)
 *   - aggregate totals differ
 *   - golden text differs
 *
 *   deno run -A scripts/compiler-coverage/check.ts
 *   deno task compiler:coverage:check
 *
 * Does not change compile semantics.
 */
import { dirname, fromFileUrl, join } from "jsr:@std/path@1";
import { compileSource } from "../../src/compiler/mod.ts";
import { FIXTURES } from "./corpus.ts";
import {
  BASELINE_PATH,
  type CoverageReport,
  type FixtureReport,
  GOLDENS_DIR,
  measureAll,
} from "./measure.ts";
import { measureOutput, normalizeGolden } from "./metrics.ts";

const failures: string[] = [];

function metricKeys(
  m: FixtureReport["metrics"],
): (keyof FixtureReport["metrics"])[] {
  return Object.keys(m) as (keyof FixtureReport["metrics"])[];
}

const baseline: CoverageReport = JSON.parse(
  await Deno.readTextFile(BASELINE_PATH),
);
const current = await measureAll(false);

const byId = new Map(baseline.fixtures.map((f) => [f.id, f]));

for (const f of FIXTURES) {
  if (!byId.has(f.id)) {
    failures.push(`${f.id}: missing from baseline`);
  }
}
for (const b of baseline.fixtures) {
  if (!FIXTURES.some((f) => f.id === b.id)) {
    failures.push(`${b.id}: in baseline but not in corpus`);
  }
}

for (const cur of current.fixtures) {
  const base = byId.get(cur.id);
  if (!base) continue;
  for (const k of metricKeys(base.metrics)) {
    if (cur.metrics[k] !== base.metrics[k]) {
      failures.push(
        `${cur.id}.metrics.${k}: current=${cur.metrics[k]} baseline=${
          base.metrics[k]
        }`,
      );
    }
  }
}

for (
  const k of Object.keys(
    baseline.aggregate,
  ) as (keyof CoverageReport["aggregate"])[]
) {
  if (current.aggregate[k] !== baseline.aggregate[k]) {
    failures.push(
      `aggregate.${k}: current=${current.aggregate[k]} baseline=${
        baseline.aggregate[k]
      }`,
    );
  }
}

// Golden text lock (also re-compile independently for clarity)
for (const f of FIXTURES) {
  const goldenPath = join(GOLDENS_DIR, `${f.id}.out.txt`);
  let expected: string;
  try {
    expected = normalizeGolden(await Deno.readTextFile(goldenPath));
  } catch {
    failures.push(`${f.id}: missing golden ${goldenPath}`);
    continue;
  }
  const actual = normalizeGolden(
    compileSource(f.source, f.fileName, f.options ?? {}),
  );
  if (actual !== expected) {
    failures.push(
      `${f.id}: golden mismatch (len actual=${actual.length} expected=${expected.length})`,
    );
    // keep metrics honest even when golden drifts
    const am = measureOutput(actual);
    const em = measureOutput(expected);
    if (am.setAttributeCalls !== em.setAttributeCalls) {
      failures.push(
        `${f.id}: setAttribute ${am.setAttributeCalls} vs golden ${em.setAttributeCalls}`,
      );
    }
  }
}

console.log(`Gate baseline: ${BASELINE_PATH}`);
console.log(`Goldens dir: ${GOLDENS_DIR}`);
console.log(`Corpus fixtures: ${FIXTURES.length}`);
console.log(
  `staticDomOpFreeRatio: ${current.aggregate.staticDomOpFreeRatio} (baseline ${baseline.aggregate.staticDomOpFreeRatio})`,
);

if (failures.length) {
  console.error("\nCompiler coverage / golden gate FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nIf the compile output change is intentional, refresh:\n  deno task compiler:coverage:baseline\nthen commit scripts/compiler-coverage/compiler-coverage-baseline.json and goldens/.",
  );
  Deno.exit(1);
}

console.log("\nOK — metrics and goldens match baseline.");
Deno.exit(0);

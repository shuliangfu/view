/**
 * Measure compiler static-subtree / path / Effect-style binding metrics
 * over the shared fixture corpus. Write baseline JSON with --write.
 *
 *   deno run -A scripts/compiler-coverage/measure.ts
 *   deno run -A scripts/compiler-coverage/measure.ts --write
 *   deno task compiler:coverage:baseline
 *
 * Does not change compile semantics. Goldens live under ./goldens/.
 */
import { ensureDir } from "jsr:@std/fs@1/ensure-dir";
import { dirname, fromFileUrl, join } from "jsr:@std/path@1";
import { compileSource } from "../../src/compiler/mod.ts";
import { FIXTURES } from "./corpus.ts";
import {
  measureOutput,
  normalizeGolden,
  type OutputMetrics,
} from "./metrics.ts";

const HERE = dirname(fromFileUrl(import.meta.url));
const ROOT = join(HERE, "../..");
export const BASELINE_PATH = join(HERE, "compiler-coverage-baseline.json");
export const GOLDENS_DIR = join(HERE, "goldens");

export interface FixtureReport {
  id: string;
  fileName: string;
  note: string;
  options: Record<string, unknown>;
  metrics: OutputMetrics;
  goldenRel: string;
}

export interface CoverageReport {
  version: 1;
  package: string;
  measuredAt: string;
  command: string;
  denoTask: string;
  notes: string[];
  fixtures: FixtureReport[];
  aggregate: {
    fixtureCount: number;
    totalSetAttribute: number;
    totalSetProperty: number;
    totalWalk: number;
    totalInsert: number;
    totalMemo: number;
    totalSpread: number;
    totalPathConsts: number;
    zeroReactiveDomOpsCount: number;
    /** Share of fixtures with zeroReactiveDomOps (0–1) */
    staticDomOpFreeRatio: number;
  };
}

function optionsRecord(
  opts: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const o = opts ?? {};
  const out: Record<string, unknown> = {};
  for (const k of ["hydration", "generate", "hmr", "insertImportPath"]) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}

export async function measureAll(write = false): Promise<CoverageReport> {
  const fixtures: FixtureReport[] = [];
  if (write) await ensureDir(GOLDENS_DIR);

  for (const f of FIXTURES) {
    const output = compileSource(f.source, f.fileName, f.options ?? {});
    const normalized = normalizeGolden(output);
    const metrics = measureOutput(normalized);
    const goldenName = `${f.id}.out.txt`;
    const goldenRel = `scripts/compiler-coverage/goldens/${goldenName}`;
    if (write) {
      await Deno.writeTextFile(join(GOLDENS_DIR, goldenName), normalized);
    }
    fixtures.push({
      id: f.id,
      fileName: f.fileName,
      note: f.note,
      options: optionsRecord(f.options as Record<string, unknown> | undefined),
      metrics,
      goldenRel,
    });
  }

  const totalSetAttribute = fixtures.reduce(
    (s, x) => s + x.metrics.setAttributeCalls,
    0,
  );
  const totalSetProperty = fixtures.reduce(
    (s, x) => s + x.metrics.setPropertyCalls,
    0,
  );
  const totalWalk = fixtures.reduce((s, x) => s + x.metrics.walkCalls, 0);
  const totalInsert = fixtures.reduce((s, x) => s + x.metrics.insertCalls, 0);
  const totalMemo = fixtures.reduce((s, x) => s + x.metrics.memoCalls, 0);
  const totalSpread = fixtures.reduce((s, x) => s + x.metrics.spreadCalls, 0);
  const totalPathConsts = fixtures.reduce(
    (s, x) => s + x.metrics.pathConstDecls,
    0,
  );
  const zeroReactiveDomOpsCount = fixtures.filter((x) =>
    x.metrics.zeroReactiveDomOps
  ).length;

  const report: CoverageReport = {
    version: 1,
    package: "@dreamer/view",
    measuredAt: new Date().toISOString(),
    command: "deno run -A scripts/compiler-coverage/measure.ts [--write]",
    denoTask: "deno task compiler:coverage:baseline",
    notes: [
      "Metrics are counted on compileSource() output body (after injected imports).",
      "setAttribute ≈ reactive Effect-style attrs; setProperty ≈ one-shot; walk ≈ dynamic path.",
      "zeroReactiveDomOps = no walk/setAttribute/setProperty/spread in body (static DOM op-free).",
      "Goldens lock full normalized compile output; refresh intentionally with --write.",
      "Does not change default compile semantics.",
    ],
    fixtures,
    aggregate: {
      fixtureCount: fixtures.length,
      totalSetAttribute,
      totalSetProperty,
      totalWalk,
      totalInsert,
      totalMemo,
      totalSpread,
      totalPathConsts,
      zeroReactiveDomOpsCount,
      staticDomOpFreeRatio: +(zeroReactiveDomOpsCount / fixtures.length)
        .toFixed(4),
    },
  };

  printTable(report);
  if (write) {
    await Deno.writeTextFile(
      BASELINE_PATH,
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(`\nwrote ${BASELINE_PATH}`);
    console.log(`wrote ${fixtures.length} goldens under ${GOLDENS_DIR}`);
  }
  return report;
}

export function printTable(report: CoverageReport) {
  console.log("\n# @dreamer/view compiler static-subtree coverage baseline\n");
  console.log(`measuredAt: ${report.measuredAt}`);
  console.log(`fixtures: ${report.aggregate.fixtureCount}`);
  console.log(
    `staticDomOpFreeRatio: ${report.aggregate.staticDomOpFreeRatio} (${report.aggregate.zeroReactiveDomOpsCount}/${report.aggregate.fixtureCount})`,
  );
  console.log(
    `totals: setAttribute=${report.aggregate.totalSetAttribute} setProperty=${report.aggregate.totalSetProperty} walk=${report.aggregate.totalWalk} insert=${report.aggregate.totalInsert} memo=${report.aggregate.totalMemo} spread=${report.aggregate.totalSpread} pathConsts=${report.aggregate.totalPathConsts}\n`,
  );
  console.log(
    "| id | tmpl | walk | insert | setAttr | setProp | spread | memo | paths | zeroReact |",
  );
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|");
  for (const f of report.fixtures) {
    const m = f.metrics;
    console.log(
      `| \`${f.id}\` | ${m.templateCalls} | ${m.walkCalls} | ${m.insertCalls} | ${m.setAttributeCalls} | ${m.setPropertyCalls} | ${m.spreadCalls} | ${m.memoCalls} | ${m.pathConstDecls} | ${m.zeroReactiveDomOps ? "Y" : ""} |`,
    );
  }
  console.log("");
}

if (import.meta.main) {
  await measureAll(Deno.args.includes("--write"));
}

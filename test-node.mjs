#!/usr/bin/env node
/**
 * Node.js test runner — runs each test file in the MAIN process (no --test flag).
 *
 * 【Why 根源】Node 22's `node --test` forks a child process per file and uses the
 * child's stdout as the TAP/IPC message channel (parsed via structuredClone). When
 * a test file — or code under test — writes to stdout (e.g. `console.log()`), the
 * non-TAP bytes corrupt the parent's message parser, throwing "Unable to
 * deserialize cloned data due to invalid or unsupported version."
 *
 * `--test-isolation=none` would disable forking, but it is Node 23+ only. Our
 * `engines.node >= 22` constraint means CI runs Node 22, where the flag is absent.
 *
 * 【Fix】Run each file as the entry point (`node --import tsx <file>`) WITHOUT the
 * `--test` flag. `node:test` auto-runs registered tests IN-PROCESS when the module
 * is the main entry — no child process, no IPC, no serialization bug. The process
 * exit code still reflects results (0 on pass, 1 on fail). `--test-force-exit`
 * ensures the process exits even if a test leaves dangling handles (timers etc.).
 *
 * 【Invariant】One file per process invocation; exit code is the single source of
 * truth for pass/fail. E2E tests (tests/e2e/) are excluded — they require
 * Playwright/Chromium which is not available in Node CI.
 */
import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, resolve } from "node:path";

process.env.CI = "true";

// 排除 Deno 专属集成测试：dweb-import-ssr 用 createCommand 起 deno run 子进程，
// 依赖 dweb 项目的 Deno 配置，Node 上无法运行。
const EXCLUDE = ["integration/dweb-import-ssr.test.ts"];

// 递归收集 .test.ts 文件，排除 e2e（需 Playwright）和 bench（非测试）
function collectTests(dir, base = dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // 跳过 e2e 和 bench 目录
      if (entry === "e2e" || entry === "bench") continue;
      results.push(...collectTests(full, base));
    } else if (entry.endsWith(".test.ts")) {
      // 跳过 Deno 专属集成测试
      const rel = relative(base, full).replace(/\\/g, "/");
      if (EXCLUDE.includes(rel)) continue;
      results.push(full);
    }
  }
  return results.sort();
}

const root = resolve("tests");
const files = collectTests(root);

console.log(`Found ${files.length} test files (e2e/bench excluded)\n`);

let failed = 0;
for (const file of files) {
  const rel = relative(process.cwd(), file);
  console.log(`▶ ${rel}`);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test-force-exit", file],
    {
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
    },
  );
  if (result.status !== 0) {
    failed++;
    console.error(`✗ FAILED: ${rel}\n`);
  } else {
    console.log(`✓ ${rel}\n`);
  }
}

console.log("=".repeat(60));
if (failed > 0) {
  console.error(`✗ ${failed}/${files.length} test file(s) failed`);
  process.exit(1);
}
console.log(`✓ All ${files.length} test files passed`);

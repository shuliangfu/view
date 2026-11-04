/**
 * @fileoverview P2 examples subpath dogfood: hand-written examples sources must
 * not import the convenience main barrel (`@dreamer/view` with no subpath).
 * Generated `routers.tsx` is gitignored; codegen is locked in routers-codegen.
 */
import { join } from "@dreamer/runtime-adapter";
import { describe, expect, it } from "@dreamer/test";

const BARE_MAIN =
  /from\s+["']@dreamer\/view["']|import\(\s*["']@dreamer\/view["']\s*\)/;

async function collectTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...await collectTsFiles(path));
      continue;
    }
    if (!entry.isFile) continue;
    if (entry.name === "routers.tsx") continue;
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

describe("examples subpath dogfood (P2)", () => {
  it("examples/src hand-written modules avoid bare @dreamer/view main entry", async () => {
    const root = join(Deno.cwd(), "examples", "src");
    const files = await collectTsFiles(root);
    expect(files.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const path of files) {
      const text = await Deno.readTextFile(path);
      if (BARE_MAIN.test(text)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });
});

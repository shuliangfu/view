/**
 * @fileoverview `layout.ts` 中布局链与 inheritLayout / loading 解析。
 */
import {
  ensureDir,
  join,
  makeTempDir,
  remove,
  writeTextFile,
} from "@dreamer/runtime-adapter";
import { describe, expect, it } from "@dreamer/test";
import {
  computeLayoutChain,
  readInheritLayoutFromLayoutFile,
  readInheritLayoutFromPageFile,
  readLoadingFromPageFile,
} from "../../../src/server/core/layout.ts";

describe("server/core/layout", () => {
  it("readInheritLayoutFromLayoutFile：应解析 export const inheritLayout = false", async () => {
    const dir = await makeTempDir();
    try {
      const path = join(dir, "_layout.tsx");
      await writeTextFile(
        path,
        `export const inheritLayout = false\nexport default function L() { return null }\n`,
      );
      const v = await readInheritLayoutFromLayoutFile(path);
      expect(v).toBe(false);
    } finally {
      await remove(dir, { recursive: true });
    }
  });

  it("readInheritLayoutFromPageFile：应读取页面级 inheritLayout", async () => {
    const dir = await makeTempDir();
    try {
      const path = join(dir, "page.tsx");
      await writeTextFile(
        path,
        `export const inheritLayout = true\n`,
      );
      const v = await readInheritLayoutFromPageFile(path);
      expect(v).toBe(true);
    } finally {
      await remove(dir, { recursive: true });
    }
  });

  it("readLoadingFromPageFile：export const loading = false 时应返回 false", async () => {
    const dir = await makeTempDir();
    try {
      const path = join(dir, "p.tsx");
      await writeTextFile(path, `export const loading = false\n`);
      const v = await readLoadingFromPageFile(path);
      expect(v).toBe(false);
    } finally {
      await remove(dir, { recursive: true });
    }
  });

  it("computeLayoutChain：根与子目录 _layout 应生成正确 import 路径列表", async () => {
    const views = await makeTempDir();
    try {
      await writeTextFile(
        join(views, "_layout.tsx"),
        `export const inheritLayout = true\n`,
      );
      await ensureDir(join(views, "dash"));
      await writeTextFile(
        join(views, "dash", "_layout.tsx"),
        `export const inheritLayout = true\n`,
      );
      const chain = await computeLayoutChain(views, "dash");
      expect(chain.inheritLayout).toBe(true);
      expect(chain.layoutImportPaths.length).toBe(2);
      expect(chain.layoutImportPaths[0]).toContain("_layout.tsx");
      expect(chain.layoutImportPaths[1]).toContain("dash");
    } finally {
      await remove(views, { recursive: true });
    }
  });

  it("computeLayoutChain：inheritLayout=false 的子布局应重置链且仅保留该层", async () => {
    const views = await makeTempDir();
    try {
      await writeTextFile(
        join(views, "_layout.tsx"),
        `export const inheritLayout = true\n`,
      );
      await ensureDir(join(views, "sub"));
      await writeTextFile(
        join(views, "sub", "_layout.tsx"),
        `export const inheritLayout = false\n`,
      );
      const chain = await computeLayoutChain(views, "sub");
      expect(chain.inheritLayout).toBe(false);
      expect(chain.layoutImportPaths.length).toBe(1);
      expect(chain.layoutImportPaths[0]).toContain("sub/_layout.tsx");
    } finally {
      await remove(views, { recursive: true });
    }
  });
});

/**
 * @fileoverview `generateRoutersFile` 扫描 views 并写出路由表源码。
 */
import {
  ensureDir,
  join,
  makeTempDir,
  readTextFile,
  remove,
  writeTextFile,
} from "@dreamer/runtime-adapter";
import { describe, expect, it } from "@dreamer/test";
import { generateRoutersFile } from "../../../src/server/core/routers.ts";

describe("server/core/routers (codegen)", () => {
  it("应扫描 home/index.tsx 并生成含 RouteConfig 的输出文件", async () => {
    const root = await makeTempDir();
    try {
      const views = join(root, "src", "views");
      const homeDir = join(views, "home");
      await ensureDir(homeDir);
      await writeTextFile(
        join(homeDir, "index.tsx"),
        `export default function Home() { return null }\n`,
      );
      await generateRoutersFile(root, "src/views", "src/router/routers.tsx");
      const out = join(root, "src", "router", "routers.tsx");
      const text = await readTextFile(out);
      expect(text).toContain("RouteConfig");
      expect(text).toContain("home");
    } finally {
      await remove(root, { recursive: true });
    }
  });
});

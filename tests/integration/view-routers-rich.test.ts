/**
 * @fileoverview 集成：路由 codegen 在含 _layout、_404、routePath、metadata 时的生成结果。
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
import { generateRoutersFile } from "../../src/server/core/routers.ts";

describe("integration：路由表 rich codegen", () => {
  it("应识别 routePath、metadata、_404 与根布局", async () => {
    const root = await makeTempDir();
    try {
      const views = join(root, "src", "views");
      await ensureDir(views);

      await writeTextFile(
        join(views, "_layout.tsx"),
        `export const inheritLayout = true
export default function RootLayout() { return null }
`,
      );

      await writeTextFile(
        join(views, "_404.tsx"),
        `export default function NotFound() { return null }
`,
      );

      const homeDir = join(views, "home");
      await ensureDir(homeDir);
      await writeTextFile(
        join(homeDir, "index.tsx"),
        `export default function Home() { return null }
`,
      );

      const postDir = join(views, "post");
      await ensureDir(postDir);
      await writeTextFile(
        join(postDir, "index.tsx"),
        `export const routePath = "/post/:id"
export const metadata = { title: "Post Page", description: "integration" }
export default function Post() { return null }
`,
      );

      await generateRoutersFile(root, "src/views", "src/router/routers.tsx");
      const src = await readTextFile(
        join(root, "src", "router", "routers.tsx"),
      );

      expect(src).toContain("RouteConfig");
      expect(src).toContain("/post/:id");
      expect(src).toContain("Post Page");
      expect(src).toContain("*");
      expect(src).toContain("_404");
      expect(src).toContain("_layout");
    } finally {
      await remove(root, { recursive: true });
    }
  });
});

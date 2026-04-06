/**
 * @fileoverview 集成：临时项目目录下加载配置 + 生成路由表 + SSR 字符串输出（与 dweb 目录无关，始终可跑）。
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
import {
  getServerConfigForMode,
  loadViewConfig,
} from "../../src/server/core/config.ts";
import { generateRoutersFile } from "../../src/server/core/routers.ts";
import { renderToString } from "../../src/runtime/server.ts";
import { jsx } from "@dreamer/view/jsx-runtime";

describe("integration：view 配置 + 路由 codegen + SSR", () => {
  it("应在临时项目中串联 loadViewConfig → generateRoutersFile → renderToString", async () => {
    const root = await makeTempDir();
    try {
      await writeTextFile(
        join(root, "view.config.json"),
        JSON.stringify({
          name: "integration-mini",
          server: { dev: { port: 9001 } },
        }),
      );
      const views = join(root, "src", "views");
      const homeDir = join(views, "home");
      await ensureDir(homeDir);
      await writeTextFile(
        join(homeDir, "index.tsx"),
        `export default function Home() { return null }\n`,
      );

      const cfg = await loadViewConfig(root);
      expect(cfg.name).toBe("integration-mini");

      await generateRoutersFile(root, "src/views", "src/router/routers.tsx");
      const routerSrc = await readTextFile(
        join(root, "src", "router", "routers.tsx"),
      );
      expect(routerSrc).toContain("RouteConfig");

      const html = renderToString(() =>
        jsx("div", { id: "int-root", children: cfg.name ?? "" })
      );
      expect(html).toContain("int-root");
      expect(html).toContain("integration-mini");
    } finally {
      await remove(root, { recursive: true });
    }
  });

  it("合并后的配置经 getServerConfigForMode 应得到 dev/prod 监听参数", async () => {
    const root = await makeTempDir();
    try {
      await writeTextFile(
        join(root, "view.config.json"),
        JSON.stringify({
          server: {
            host: "127.0.0.1",
            port: 6000,
            dev: { port: 6001, host: "localhost", hmr: true },
            prod: { port: 6002, host: "0.0.0.0" },
          },
        }),
      );
      const cfg = await loadViewConfig(root);
      const dev = getServerConfigForMode(cfg, "dev");
      const prod = getServerConfigForMode(cfg, "prod");
      expect(dev.port).toBe(6001);
      expect(dev.host).toBe("localhost");
      expect(dev.dev?.hmr).toBe(true);
      expect(prod.port).toBe(6002);
      expect(prod.host).toBe("0.0.0.0");
    } finally {
      await remove(root, { recursive: true });
    }
  });
});

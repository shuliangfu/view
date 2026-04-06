/**
 * @fileoverview 集成：从真实 `view.config.ts` 文件加载配置（dynamic import），与 JSON 路径并列验收。
 */
import {
  join,
  makeTempDir,
  remove,
  writeTextFile,
} from "@dreamer/runtime-adapter";
import { describe, expect, it } from "@dreamer/test";
import { loadViewConfig } from "../../src/server/core/config.ts";

describe("integration：view.config.ts 加载", () => {
  it("loadViewConfig 应 dynamic import 包内 TS 配置并合并默认值", async () => {
    const root = await makeTempDir();
    try {
      await writeTextFile(
        join(root, "view.config.ts"),
        `export default {
  name: "loaded-from-ts",
  server: {
    prod: { port: 7654, host: "0.0.0.0" },
  },
  build: {
    entry: "src/app.tsx",
  },
};
`,
      );
      const cfg = await loadViewConfig(root);
      expect(cfg.name).toBe("loaded-from-ts");
      expect(cfg.server?.prod?.port).toBe(7654);
      expect(cfg.server?.prod?.host).toBe("0.0.0.0");
      expect(cfg.build?.entry).toBe("src/app.tsx");
      expect(cfg.build?.outDir).toBe("dist");
    } finally {
      await remove(root, { recursive: true });
    }
  });
});

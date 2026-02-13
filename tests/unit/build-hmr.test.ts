/**
 * @fileoverview HMR 相关构建逻辑单元测试：getRoutePathForChangedPath 等
 */

import { describe, expect, it } from "@dreamer/test";
import { getRoutePathForChangedPath } from "../../src/cmd/build.ts";

describe("getRoutePathForChangedPath", () => {
  it('路径含 /routes/home 或 /routes/index 应返回 "/"', () => {
    expect(getRoutePathForChangedPath("src/routes/home/index.tsx")).toBe("/");
    expect(getRoutePathForChangedPath("examples/src/routes/home/index.tsx"))
      .toBe("/");
    expect(getRoutePathForChangedPath("/abs/routes/home/page.tsx")).toBe("/");
    expect(getRoutePathForChangedPath("proj/routes/index.tsx")).toBe("/");
    expect(getRoutePathForChangedPath("proj/routes/index/foo.tsx")).toBe("/");
  });

  it('路径含 /routes/{segment} 应返回 "/{segment}"', () => {
    expect(getRoutePathForChangedPath("src/routes/signal/index.tsx")).toBe(
      "/signal",
    );
    expect(getRoutePathForChangedPath("src/routes/about.tsx")).toBe("/about");
    expect(getRoutePathForChangedPath("src/routes/user/profile.tsx")).toBe(
      "/user",
    );
    expect(getRoutePathForChangedPath("/proj/routes/docs/readme.tsx")).toBe(
      "/docs",
    );
  });

  it("路径不含 /routes/ 应返回 undefined", () => {
    expect(getRoutePathForChangedPath("src/components/Button.tsx"))
      .toBeUndefined();
    expect(getRoutePathForChangedPath("dist/main.js")).toBeUndefined();
    expect(getRoutePathForChangedPath("routes.ts")).toBeUndefined();
  });

  it("Windows 风格反斜杠应被归一化并正确解析", () => {
    expect(getRoutePathForChangedPath("src\\routes\\home\\index.tsx")).toBe(
      "/",
    );
    expect(getRoutePathForChangedPath("src\\routes\\signal\\index.tsx")).toBe(
      "/signal",
    );
  });
});

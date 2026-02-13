/**
 * 路由表定义：path → component 映射
 * component 为 () => import("...") 动态导入，由 RoutePage 解析 default 并渲染
 * 后续可改为自动生成（如从文件系统或配置生成）
 */

import type { RouteConfig } from "@dreamer/view/router";

export const routes: RouteConfig[] = [
  {
    path: "/",
    component:
      (() => import("../routes/home/index.tsx")) as unknown as RouteConfig[
        "component"
      ],
    meta: { title: "首页" },
  },
  {
    path: "/signal",
    component:
      (() => import("../routes/signal/index.tsx")) as unknown as RouteConfig[
        "component"
      ],
    meta: { title: "Signal" },
  },
  {
    path: "/store",
    component:
      (() => import("../routes/store/index.tsx")) as unknown as RouteConfig[
        "component"
      ],
    meta: { title: "Store" },
  },
  {
    path: "/boundary",
    component:
      (() => import("../routes/boundary/index.tsx")) as unknown as RouteConfig[
        "component"
      ],
    meta: { title: "Boundary" },
  },
  {
    path: "/directive",
    component:
      (() => import("../routes/directive/index.tsx")) as unknown as RouteConfig[
        "component"
      ],
    meta: { title: "指令" },
  },
  {
    path: "/reactive",
    component:
      (() => import("../routes/reactive/index.tsx")) as unknown as RouteConfig[
        "component"
      ],
    meta: { title: "Reactive" },
  },
  {
    path: "/resource",
    component:
      (() => import("../routes/resource/index.tsx")) as unknown as RouteConfig[
        "component"
      ],
    meta: { title: "Resource" },
  },
  {
    path: "/context",
    component:
      (() => import("../routes/context/index.tsx")) as unknown as RouteConfig[
        "component"
      ],
    meta: { title: "Context" },
  },
  {
    path: "/runtime",
    component:
      (() => import("../routes/runtime/index.tsx")) as unknown as RouteConfig[
        "component"
      ],
    meta: { title: "Runtime" },
  },
  {
    path: "/router",
    component:
      (() => import("../routes/router/index.tsx")) as unknown as RouteConfig[
        "component"
      ],
    meta: { title: "Router" },
  },
];

export const notFoundRoute: RouteConfig = {
  path: "*",
  component:
    (() => import("../routes/not-found/index.tsx")) as unknown as RouteConfig[
      "component"
    ],
  meta: { title: "404" },
};

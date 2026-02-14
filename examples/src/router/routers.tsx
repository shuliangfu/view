/**
 * 路由表（自动生成）：path → component，使用动态 import 实现按需加载
 * 请勿手动编辑；dev 时会根据 src/views 目录自动重新生成
 */
// @ts-nocheck 自动生成文件，component 为动态 import，与 RouteConfig 的同步类型兼容由运行时处理
import type { RouteConfig } from "@dreamer/view/router";

export const routes: RouteConfig[] = [
  { path: "/", component: () => import("../views/home/index.tsx"), meta: {"title":"首页","description":"首页描述","keywords":"首页, 描述, 关键词","author":"作者","og":{"title":"首页","description":"首页描述","image":"https://example.com/image.jpg"}} },
  { path: "/boundary", component: () => import("../views/boundary/index.tsx"), meta: {"title":"Boundary","description":"ErrorBoundary、Suspense 示例","keywords":"ErrorBoundary, Suspense, 错误边界"} },
  { path: "/context", component: () => import("../views/context/index.tsx"), meta: {"title":"Context","description":"createContext、Provider、useContext 跨层注入示例","keywords":"Context, Provider, useContext"} },
  { path: "/directive", component: () => import("../views/directive/index.tsx"), meta: {"title":"Directive","description":"内置 vIf/vFor/vShow 与自定义指令 v-focus 示例","keywords":"vIf, vFor, vShow, v-focus, 指令"} },
  { path: "/layout", component: () => import("../views/layout/index.tsx"), meta: {"title":"Layout","description":"嵌套 _layout、inheritLayout 示例","keywords":"Layout, _layout, inheritLayout, 布局","group":"示例"}, layouts: [ () => import("../views/layout/_layout.tsx") ] },
  { path: "/loading", component: () => import("../views/loading/index.tsx"), meta: {"title":"Loading","description":"_loading.tsx 仅当前目录示例","keywords":"Loading, _loading, 加载态","group":"示例"}, loading: () => import("../views/loading/_loading.tsx") },
  { path: "/reactive", component: () => import("../views/reactive/index.tsx"), meta: {"title":"Reactive","description":"createReactive 响应式表单与双向绑定示例","keywords":"createReactive, 表单, 双向绑定"} },
  { path: "/resource", component: () => import("../views/resource/index.tsx"), meta: {"title":"Resource","description":"createResource 异步数据与 Suspense 示例","keywords":"createResource, Suspense, 异步数据"} },
  { path: "/router", component: () => import("../views/router/index.tsx"), meta: {"title":"Router","description":"路由说明、编程式导航、动态参数、href、守卫","keywords":"Router, navigate, beforeRoute, afterRoute"} },
  { path: "/runtime", component: () => import("../views/runtime/index.tsx"), meta: {"title":"Runtime","description":"createRoot、render、renderToString、generateHydrationScript、renderToStream 示例","keywords":"createRoot, render, renderToString, SSR, 流式"} },
  { path: "/signal", component: () => import("../views/signal/index.tsx"), meta: {"title":"Signal","description":"createSignal、createEffect、createMemo、onCleanup 核心 API 示例","keywords":"createSignal, createEffect, createMemo, onCleanup"} },
  { path: "/store", component: () => import("../views/store/index.tsx"), meta: {"title":"Store","description":"createStore + getters + actions + persist 示例","keywords":"createStore, getters, actions, persist"} },
];

export const notFoundRoute: RouteConfig = {
  path: "*", component: () => import("../views/_404.tsx"), meta: {"title":"404","description":"页面未找到"}
};
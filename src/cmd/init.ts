/**
 * init 命令：按示例项目结构初始化新项目
 * 使用 @dreamer/runtime-adapter 做文件与路径操作，兼容 Deno / Bun。
 * 版本号通过 version.ts 获取（支持缓存与 --beta：稳定版高于 beta 时仍用稳定版）。
 * 生成 views 下约定特殊文件 _app.tsx、_layout.tsx、_loading.tsx、_404.tsx、_error.tsx（路由扫描自动屏蔽）与路由页 home/about，风格参考 view/examples。
 */

import {
  cwd,
  ensureDir,
  existsSync,
  join,
  readTextFile,
  relative,
  resolve,
  writeTextFile,
} from "@dreamer/runtime-adapter";
import { getViewVersion } from "../version.ts";

/** ANSI green for success message */
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

/**
 * CLI 入口：由 @dreamer/console 的 action 调用
 * @param options options.dir 为可选目标目录（默认当前目录），options.beta 为 true 时允许使用最新 beta（若稳定版更高则仍用稳定版）
 */
export async function main(
  options?: Record<string, unknown>,
): Promise<void> {
  const beta = options?.beta === true;
  const VIEW_VERSION = await getViewVersion(beta);

  const root = cwd();
  const targetDirRaw = (options?.dir as string | undefined)?.trim() ?? ".";
  // 已是绝对路径时直接使用，避免 resolve(root, absPath) 在部分实现里被错误拼接
  const targetDir = targetDirRaw === "."
    ? root
    : targetDirRaw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(targetDirRaw)
    ? targetDirRaw
    : resolve(root, targetDirRaw);

  await ensureDir(targetDir);
  await ensureDir(join(targetDir, "src"));
  await ensureDir(join(targetDir, "src", "router"));
  await ensureDir(join(targetDir, "src", "views"));
  await ensureDir(join(targetDir, "src", "stores"));
  await ensureDir(join(targetDir, "src", "hooks"));
  await ensureDir(join(targetDir, "src", "utils"));

  /** Display path: always relative to cwd (e.g. "app-test" or ".") */
  const displayDir = targetDir === root
    ? "."
    : relative(root, targetDir) || ".";
  /** Paths of all created files (relative to project), for final listing */
  const createdFiles: string[] = [];
  const addFile = (relPath: string) => createdFiles.push(relPath);

  // ---------------------------------------------------------------------------
  // view.config.ts（对齐示例，供 dev/build/start 读取）
  // ---------------------------------------------------------------------------
  const viewConfigTs = `/**
 * view 项目配置：dev / build / start 会读取此文件
 */
const config = {
  server: {
    dev: {
      port: 8787,
      host: "127.0.0.1",
      dev: {
        hmr: { enabled: true, path: "/__hmr" },
        watch: { paths: ["./src"], ignore: ["node_modules", ".git", "dist", "routers.tsx"] },
      },
    },
    prod: { port: 8787, host: "127.0.0.1" },
  },
  build: {
    entry: "src/main.tsx",
    outDir: "dist",
    outFile: "main.js",
    minify: true,
    sourcemap: true,
    splitting: true,
  },
};

export default config;
`;
  await writeTextFile(join(targetDir, "view.config.ts"), viewConfigTs);
  addFile("view.config.ts");

  // ---------------------------------------------------------------------------
  // deno.json
  // ---------------------------------------------------------------------------
  const denoJson = {
    compilerOptions: {
      jsx: "react-jsx",
      jsxImportSource: "@dreamer/view",
      lib: ["deno.window", "dom"],
      types: ["./jsx.d.ts"],
    },
    imports: {
      "@dreamer/view": `jsr:@dreamer/view@^${VIEW_VERSION}`,
    },
    lint: { include: ["src/"], exclude: ["dist/"] },
    tasks: {
      dev: "deno run -A @dreamer/view/cli dev",
      build: "deno run -A @dreamer/view/cli build",
      start: "deno run -A @dreamer/view/cli start",
    },
  };
  await writeTextFile(
    join(targetDir, "deno.json"),
    JSON.stringify(denoJson, null, 2),
  );
  addFile("deno.json");

  // ---------------------------------------------------------------------------
  // jsx.d.ts（JSX 固有元素类型，供 TSX 类型检查；deno.json compilerOptions.types 引用）
  // ---------------------------------------------------------------------------
  const jsxDts = `/**
 * JSX 固有元素类型：供项目内 TSX 类型检查使用
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [tag: string]: Record<string, unknown>;
    }
  }
}

export {};
`;
  await writeTextFile(join(targetDir, "jsx.d.ts"), jsxDts);
  addFile("jsx.d.ts");

  // ---------------------------------------------------------------------------
  // index.html（对齐示例：/main.js、Tailwind v4、dark 首屏、data-view-cloak）
  // ---------------------------------------------------------------------------
  const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>@dreamer/view App</title>
    <script>
      try {
        var v = localStorage.getItem("view-theme");
        var isDark = v === "dark" || (v && JSON.parse(v).theme === "dark");
        if (isDark) document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
      } catch (_) {}
    </script>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <style type="text/tailwindcss">
      @custom-variant dark (&:where(.dark, .dark *));
    </style>
    <style>
      [data-view-cloak] { display: none; }
    </style>
  </head>
  <body
    class="min-h-screen bg-[linear-gradient(to_bottom,var(--tw-gradient-from),var(--tw-gradient-to))] from-slate-50 to-slate-100 text-slate-800 antialiased dark:from-slate-900 dark:to-slate-800 dark:text-slate-200"
  >
    <div id="root" data-view-cloak></div>
    <script type="module" src="/main.js"></script>
  </body>
</html>
`;
  await writeTextFile(join(targetDir, "index.html"), indexHtml);
  addFile("index.html");

  // ---------------------------------------------------------------------------
  // src/main.tsx
  // ---------------------------------------------------------------------------
  const mainTsx = `/**
 * 应用入口：创建路由并挂载根组件
 */
import { createRoot } from "@dreamer/view";
import { createAppRouter } from "./router/router.ts";
import { App } from "./views/_app.tsx";
import { notFoundRoute, routes } from "./router/routers.tsx";

const container = document.getElementById("root");
if (container) {
  const router = createAppRouter({ routes, notFound: notFoundRoute });
  createRoot(() => <App router={router} />, container);
  container.removeAttribute("data-view-cloak");
}
`;
  await writeTextFile(join(targetDir, "src", "main.tsx"), mainTsx);
  addFile("src/main.tsx");

  // ---------------------------------------------------------------------------
  // src/views/_app.tsx（约定根组件，路由扫描自动屏蔽）
  // ---------------------------------------------------------------------------
  const appTsx = `/**
 * 根组件（约定 _app.tsx）：使用 router.getCurrentRouteSignal() 响应当前路由，渲染 Layout + 当前页
 */
import type { VNode } from "@dreamer/view";
import { RoutePage, type Router } from "@dreamer/view/router";
import { routes } from "../router/routers.tsx";
import { Layout } from "./_layout.tsx";

export function App(props: { router: Router }): VNode {
  const current = props.router.getCurrentRouteSignal()();
  if (!current) {
    return (
      <Layout routes={routes} currentPath="">
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-12 shadow-lg dark:border-slate-600/80 dark:bg-slate-800/90 flex min-h-[200px] items-center justify-center">
          <p className="text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            加载中…
          </p>
        </section>
      </Layout>
    );
  }
  const pageTitle = (current.meta?.title as string) ?? current.path;
  if (typeof globalThis.document !== "undefined" && globalThis.document.title !== pageTitle) {
    globalThis.document.title = \`\${pageTitle} - @dreamer/view\`;
  }
  const routePage = (
    <RoutePage match={current} router={props.router} labels={{ errorTitle: "Load failed", retryText: "Retry", loadingText: "Loading…" }} />
  );
  if (current.inheritLayout === false) return routePage;
  return (
    <Layout routes={routes} currentPath={current.path}>
      {routePage}
    </Layout>
  );
}
`;
  await writeTextFile(join(targetDir, "src", "views", "_app.tsx"), appTsx);
  addFile("src/views/_app.tsx");

  // ---------------------------------------------------------------------------
  // src/views/_layout.tsx（约定布局，路由扫描自动屏蔽）
  // ---------------------------------------------------------------------------
  const layoutTsx = `/**
 * 布局（约定 _layout.tsx）：顶部导航栏 + 主内容区，支持主题切换
 */
import type { VNode } from "@dreamer/view";
import type { RouteConfig } from "@dreamer/view/router";
import { theme, toggleTheme } from "../stores/theme.ts";

export interface NavItem {
  path: string;
  label: string;
}

function navItemsFromRoutes(routes: RouteConfig[]): NavItem[] {
  return routes
    .filter((r) => r.path !== "*")
    .map((r) => ({
      path: r.path,
      label: (r.meta?.title as string) ?? r.path,
    }));
}

interface LayoutProps {
  routes: RouteConfig[];
  currentPath?: string;
  children: VNode | VNode[];
}

export function Layout(props: LayoutProps): VNode {
  const { routes, currentPath = "", children } = props;
  const navItems = navItemsFromRoutes(routes);
  const isDark = theme() === "dark";
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-800/80">
        <nav className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <a
            href="/"
            className="text-lg font-semibold tracking-tight text-slate-800 hover:text-indigo-600 transition-colors dark:text-slate-200 dark:hover:text-indigo-400"
          >
            @dreamer/view
          </a>
          <div className="flex items-center gap-2">
            <ul className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = currentPath === item.path;
                return (
                  <li key={item.path}>
                    <a
                      href={item.path}
                      className={isActive
                        ? "rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-900/50"
                        : "rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"}
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => toggleTheme()}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              title={isDark ? "切换到浅色" : "切换到深色"}
              aria-label={isDark ? "切换到浅色" : "切换到深色"}
            >
              {isDark ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
`;
  await writeTextFile(
    join(targetDir, "src", "views", "_layout.tsx"),
    layoutTsx,
  );
  addFile("src/views/_layout.tsx");

  // ---------------------------------------------------------------------------
  // src/views/_loading.tsx（约定加载占位，路由扫描自动屏蔽）
  // ---------------------------------------------------------------------------
  const loadingTsx = `/**
 * 路由懒加载占位（约定 _loading.tsx）。RoutePage 会取 default 导出并调用 (match) => VNode。
 */
import type { VNode } from "@dreamer/view";

export default function RouteLoading(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-12 shadow-lg dark:border-slate-600/80 dark:bg-slate-800/90 flex min-h-[200px] items-center justify-center">
      <p className="text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
        加载中…
      </p>
    </section>
  );
}
`;
  await writeTextFile(
    join(targetDir, "src", "views", "_loading.tsx"),
    loadingTsx,
  );
  addFile("src/views/_loading.tsx");

  // ---------------------------------------------------------------------------
  // src/views/_404.tsx（约定 404 页，作为 path * 的 notFound 路由）
  // ---------------------------------------------------------------------------
  const notFoundTsxContent = `/**
 * 404 页面（约定 _404.tsx）：作为 path * 的 notFound 路由
 */
import type { VNode } from "@dreamer/view";

export const meta = {
  title: "404",
  description: "页面未找到",
};

export default function NotFound(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-12 shadow-xl text-center dark:border-slate-600/80 dark:bg-slate-800/95">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">页面未找到</h2>
      <p className="mt-2 text-slate-600 dark:text-slate-300">您访问的路径不存在。</p>
      <a
        href="/"
        className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        返回首页
      </a>
    </section>
  );
}
`;

  // ---------------------------------------------------------------------------
  // src/views/_error.tsx（约定错误兜底，路由扫描自动屏蔽）
  // ---------------------------------------------------------------------------
  const errorTsx = `/**
 * 错误兜底（约定 _error.tsx）：用于 ErrorBoundary 等
 */
import type { VNode } from "@dreamer/view";

interface ErrorViewProps {
  error?: unknown;
  onRetry?: () => void;
}

export function ErrorView(props: ErrorViewProps): VNode {
  const message = props.error instanceof Error ? props.error.message : String(props.error ?? "未知错误");
  return (
    <section className="rounded-2xl border border-red-200/80 bg-white p-12 shadow-xl text-center dark:border-red-800/80 dark:bg-slate-800/95">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">加载失败</h2>
      <p className="mt-2 text-slate-600 dark:text-slate-300 wrap-break-word">{message}</p>
      {props.onRetry && (
        <button type="button" onClick={() => props.onRetry?.()} className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          重试
        </button>
      )}
    </section>
  );
}
`;
  await writeTextFile(
    join(targetDir, "src", "views", "_404.tsx"),
    notFoundTsxContent,
  );
  addFile("src/views/_404.tsx");
  await writeTextFile(
    join(targetDir, "src", "views", "_error.tsx"),
    errorTsx,
  );
  addFile("src/views/_error.tsx");

  // ---------------------------------------------------------------------------
  // src/views/home.tsx（首页：Hero + 简介，美化）
  // ---------------------------------------------------------------------------
  const homeTsx = `/**
 * 首页：欢迎、计数器演示与简介
 */
import { createSignal } from "@dreamer/view";
import type { VNode } from "@dreamer/view";

export default function Home(): VNode {
  const [count, setCount] = createSignal(0);
  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl dark:border-slate-600/80 dark:bg-slate-800/95 sm:p-12">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          View 模板引擎
        </p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          欢迎使用 @dreamer/view
        </h1>
        <p className="max-w-xl text-slate-600 dark:text-slate-300 leading-relaxed">
          这是一个由 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-700">view init</code> 生成的项目。
          编辑 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-700">src/views/home.tsx</code> 和{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-700">src/views/about.tsx</code> 开始开发。
        </p>
        <a
          href="/about"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          前往关于
          <span aria-hidden="true">→</span>
        </a>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl dark:border-slate-600/80 dark:bg-slate-800/95 sm:p-12">
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
          计数器演示
        </h2>
        <p className="mb-6 max-w-xl text-sm text-slate-600 dark:text-slate-300">
          使用 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-700">createSignal</code> 实现响应式计数。
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setCount(count() - 1)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            −
          </button>
          <span className="min-w-12 text-center text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
            {count()}
          </span>
          <button
            type="button"
            onClick={() => setCount(count() + 1)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            +
          </button>
        </div>
      </section>
    </div>
  );
}
`;
  await writeTextFile(join(targetDir, "src", "views", "home.tsx"), homeTsx);
  addFile("src/views/home.tsx");

  // ---------------------------------------------------------------------------
  // src/views/about.tsx（关于页，美化）
  // ---------------------------------------------------------------------------
  const aboutTsx = `/**
 * 关于页
 */
import type { VNode } from "@dreamer/view";

export default function About(): VNode {
  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl dark:border-slate-600/80 dark:bg-slate-800/95 sm:p-12">
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          关于
        </h1>
        <p className="mb-4 text-slate-600 dark:text-slate-300 leading-relaxed">
          @dreamer/view 是面向前端的视图层库，提供响应式、路由、Store、Boundary 等能力。
        </p>
        <ul className="list-inside list-disc space-y-2 text-slate-600 dark:text-slate-300">
          <li>响应式：createSignal、createEffect、createMemo</li>
          <li>路由：无刷新切换、守卫、标题同步</li>
          <li>Store：状态 + 持久化</li>
          <li>Boundary：错误边界与 Suspense</li>
        </ul>
        <a
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <span aria-hidden="true">←</span>
          返回首页
        </a>
      </section>
    </div>
  );
}
`;
  await writeTextFile(join(targetDir, "src", "views", "about.tsx"), aboutTsx);
  addFile("src/views/about.tsx");

  // ---------------------------------------------------------------------------
  // src/router/router.ts
  // ---------------------------------------------------------------------------
  const routerTs = `/**
 * 路由实例与上下文：创建应用路由，提供 RouterProvider、useRouter
 */
import { createContext } from "@dreamer/view/context";
import {
  createRouter as createViewRouter,
  type RouteConfig,
  type Router,
} from "@dreamer/view/router";
import type { VNode } from "@dreamer/view";

export const RouterContext = createContext<Router | null>(null, "Router");

export function RouterProvider(props: {
  router: Router;
  children: VNode | VNode[];
}): VNode | VNode[] | null {
  return RouterContext.Provider({
    value: props.router,
    children: props.children,
  });
}

RouterContext.registerProviderAlias(
  RouterProvider as (p: Record<string, unknown>) => VNode | VNode[] | null,
  (p) => (p as { router: Router }).router,
);

export function useRouter(): Router | null {
  return RouterContext.useContext();
}

export function createAppRouter(opts: {
  routes: RouteConfig[];
  notFound: RouteConfig;
}): Router {
  if (typeof createViewRouter !== "function") {
    throw new Error(
      "[view] createRouter from @dreamer/view/router is undefined. " +
        "Ensure @dreamer/view is installed and the build resolves the /router subpath (e.g. jsr:@dreamer/view@^1.0.0-beta.24/router).",
    );
  }
  const router = createViewRouter({
    routes: opts.routes,
    notFound: opts.notFound,
    interceptLinks: true,
    afterRoute: (to) => {
      const title = (to?.meta?.title as string) ?? "";
      if (title && typeof globalThis.document !== "undefined") {
        globalThis.document.title = \`\${title} - @dreamer/view\`;
      }
    },
  });
  router.start();
  return router;
}
`;
  await writeTextFile(join(targetDir, "src", "router", "router.ts"), routerTs);
  addFile("src/router/router.ts");

  // ---------------------------------------------------------------------------
  // src/router/routers.tsx（路由表：动态 import，dev 时会按 src/views 自动重新生成，勿提交）
  // ---------------------------------------------------------------------------
  const routersTsx = `/**
 * 路由表（自动生成）：path → component，使用动态 import 实现按需加载
 * 请勿手动编辑；dev 时会根据 src/views 目录自动重新生成
 */
import type { RouteConfig } from "@dreamer/view/router";

export const routes: RouteConfig[] = [
  { path: "/", component: () => import("../views/home.tsx"), meta: { title: "首页" } },
  { path: "/about", component: () => import("../views/about.tsx"), meta: { title: "关于" } },
];

export const notFoundRoute: RouteConfig = {
  path: "*",
  component: () => import("../views/_404.tsx"),
  meta: { title: "404" },
};
`;
  await writeTextFile(
    join(targetDir, "src", "router", "routers.tsx"),
    routersTsx,
  );
  addFile("src/router/routers.tsx");

  // ---------------------------------------------------------------------------
  // src/stores/theme.ts
  // ---------------------------------------------------------------------------
  const themeTs =
    `import { createStore, withActions } from "@dreamer/view/store";

export type Theme = "light" | "dark";
type ThemeState = Record<string, unknown> & { theme: Theme };

function applyToDom(theme: Theme): void {
  if (typeof globalThis.document === "undefined") return;
  globalThis.document.documentElement.classList.toggle("dark", theme === "dark");
}

export const themeStore = createStore("theme", {
  state: { theme: "light" as Theme } as ThemeState,
  actions: withActions<ThemeState, { setTheme: (n: Theme) => void; toggleTheme: () => void }>()({
    setTheme(next) {
      this.theme = next;
      applyToDom(next);
    },
    toggleTheme() {
      this.setTheme(this.theme === "dark" ? "light" : "dark");
    },
  }),
  persist: { key: "view-theme" },
});
applyToDom(themeStore.theme);
export function theme(): Theme {
  return themeStore.theme;
}
export const setTheme = themeStore.setTheme;
export const toggleTheme = themeStore.toggleTheme;
`;
  await writeTextFile(join(targetDir, "src", "stores", "theme.ts"), themeTs);
  addFile("src/stores/theme.ts");

  await writeTextFile(
    join(targetDir, "src", "hooks", "index.ts"),
    'export { useRouter } from "../router/router.ts";\n',
  );
  addFile("src/hooks/index.ts");
  await writeTextFile(
    join(targetDir, "src", "utils", "README.md"),
    "# utils\n",
  );
  addFile("src/utils/README.md");

  // ---------------------------------------------------------------------------
  // .gitignore：忽略构建产物与自动生成的路由表（勿提交）
  // ---------------------------------------------------------------------------
  const gitignorePath = join(targetDir, ".gitignore");
  const routersIgnore = "src/router/routers.tsx";
  if (existsSync(gitignorePath)) {
    const content = await readTextFile(gitignorePath);
    if (
      !content.includes("routers.tsx") && !content.includes("router/routers")
    ) {
      await writeTextFile(
        gitignorePath,
        content.trimEnd() + "\n" + routersIgnore + "\n",
      );
      addFile(".gitignore");
    }
  } else {
    await writeTextFile(
      gitignorePath,
      "dist/\n" + routersIgnore + "\n",
    );
    addFile(".gitignore");
  }

  const prefix = displayDir === "." ? "" : displayDir + "/";
  createdFiles.sort();
  for (const f of createdFiles) {
    console.log(prefix + f);
  }
  console.log(
    `${GREEN}Project created successfully at ${displayDir}.${RESET}`,
  );

  console.log("");
  if (displayDir !== ".") {
    console.log(`cd ${displayDir}`);
  }
  console.log("dev: view-cli dev");
  console.log("build: view-cli build");
  console.log("prod: view-cli start");
  console.log("");
}

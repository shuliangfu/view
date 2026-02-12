/**
 * @dreamer/view — 内置 SPA 路由（不依赖 @dreamer/router/client）
 *
 * 基于 History API 的客户端路由，支持无刷新跳转、路由订阅、链接拦截、
 * 路由守卫（前置/后置）、404 兜底、back/forward/go、路由 meta。仅 history 模式。
 */
import type { VNode } from "./types.ts";
/** 前置守卫返回值：false 取消导航，string 重定向到该路径，true/void 放行 */
export type RouteGuardResult = boolean | string | void | Promise<boolean | string | void>;
/** 前置守卫：(to, from) => 放行/取消/重定向 */
export type RouteGuard = (to: RouteMatch | null, from: RouteMatch | null) => RouteGuardResult;
/** 后置守卫：导航完成后执行，用于埋点、改 title 等 */
export type RouteGuardAfter = (to: RouteMatch | null, from: RouteMatch | null) => void | Promise<void>;
/**
 * 单条路由配置：path 支持动态参数 :param，可选 meta 供守卫或布局使用
 * @example
 * { path: "/", component: () => <Home />, meta: { title: "首页" } }
 * { path: "/user/:id", component: (match) => <User id={match.params.id} /> }
 */
export interface RouteConfig {
    /** 路径模式，支持 :param（如 /user/:id） */
    path: string;
    /** 渲染该路由的组件，接收当前匹配结果 */
    component: (match: RouteMatch) => VNode;
    /** 路由元信息，如 title、requiresAuth，供守卫或布局读取 */
    meta?: Record<string, unknown>;
}
/**
 * 当前路由匹配结果，供 component 与守卫使用
 */
export interface RouteMatch {
    /** 匹配到的路由 path 模式（如 "/user/:id"） */
    path: string;
    /** 动态参数（如 { id: "123" }） */
    params: Record<string, string>;
    /** 查询参数（如 ?a=1 => { a: "1" }） */
    query: Record<string, string>;
    /** 当前完整路径（pathname） */
    fullPath: string;
    /** 渲染该路由的组件 */
    component: (match: RouteMatch) => VNode;
    /** 该路由的 meta（若配置了） */
    meta?: Record<string, unknown>;
}
export interface CreateRouterOptions {
    /** 路由表，按顺序匹配，第一个匹配成功即返回 */
    routes: RouteConfig[];
    /** 基础路径，默认为 ""；所有 path 会与此拼接后再匹配 */
    basePath?: string;
    /** 是否在 start() 时拦截同源 <a> 点击做客户端导航，默认 true */
    interceptLinks?: boolean;
    /** 无匹配时使用的兜底路由（404 页），path 建议设为 "*" */
    notFound?: RouteConfig;
    /** 前置守卫：导航前执行，返回 false 取消、string 重定向、true/void 放行；支持异步 */
    beforeRoute?: RouteGuard | RouteGuard[];
    /** 后置守卫：导航完成后执行；支持异步 */
    afterRoute?: RouteGuardAfter | RouteGuardAfter[];
    /** 前置守卫最大重定向次数，防止死循环，默认 5 */
    maxRedirects?: number;
}
export interface Router {
    /** 获取当前路由匹配结果，无匹配且未配置 notFound 时返回 null */
    getCurrentRoute(): RouteMatch | null;
    /** 将 path 转为完整 href（basePath + path），用于 <a href> */
    href(path: string): string;
    /** 导航到 path（默认 pushState），会执行前置/后置守卫，返回 Promise */
    navigate(path: string, replace?: boolean): Promise<void>;
    /** 替换当前历史记录并导航（等价于 navigate(path, true)） */
    replace(path: string): Promise<void>;
    /** 浏览器后退 */
    back(): void;
    /** 浏览器前进 */
    forward(): void;
    /** 浏览器前进/后退步数 */
    go(delta: number): void;
    /** 订阅路由变化（navigate / 浏览器前进后退），返回取消订阅函数 */
    subscribe(callback: () => void): () => void;
    /** 启动：监听 popstate，可选拦截同源 <a> 点击 */
    start(): void;
    /** 停止：移除所有监听与链接拦截 */
    stop(): void;
}
/**
 * 创建 SPA 路由器实例（不依赖 @dreamer/router/client）
 *
 * @example
 * const router = createRouter({
 *   routes: [
 *     { path: "/", component: () => <Home /> },
 *     { path: "/user/:id", component: (m) => <User id={m.params.id} /> },
 *   ],
 * });
 * router.start();
 * // 在 createRoot 中：const [match, setMatch] = createSignal(router.getCurrentRoute());
 * // router.subscribe(() => setMatch(router.getCurrentRoute()));
 * // 根组件根据 match() 渲染 match()?.component(match()!)
 */
export declare function createRouter(options: CreateRouterOptions): Router;
//# sourceMappingURL=router.d.ts.map
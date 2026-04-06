/**
 * @module router/router
 * @description 示例路由辅助：再导出 `useRouter`；全局 `beforeEach` 与拦截演示用的 storage 键放在此文件，供 `main.tsx` 与 `/route-guard` 页共用。路由器实例仅在 `main.tsx` 中 `createRouter` 一次。
 */
import type { RouteLocation } from "@dreamer/view";

export { type Router, useRouter } from "@dreamer/view";

/** sessionStorage 键：为 "1" 时拦截所有前往 `/form` 的导航（演示路由卫士） */
export const GUARD_BLOCK_FORM_KEY = "view-examples:guard:block-form";

/**
 * 读取是否启用「拦截 Form 页」演示开关（仅浏览器、存储不可用时视为关闭）。
 */
function isBlockFormEnabled(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(GUARD_BLOCK_FORM_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 将 `RouteLocation` 压成可日志化的纯对象（避免循环引用）。
 */
function snapshot(loc: RouteLocation | null) {
  if (!loc) return null;
  return {
    pathname: loc.pathname,
    path: loc.path,
    search: loc.search,
    hash: loc.hash,
    query: { ...loc.query },
    params: { ...loc.params },
  };
}

/**
 * 全局导航守卫：每次客户端导航前调用；返回 `false` 取消本次导航（history 已发生的 popstate 无法完全回滚，以框架行为为准）。
 *
 * @param to - 即将进入的位置
 * @param from - 当前位置；首次进入可为 null
 * @returns `false` 表示拦截，其余表示放行
 */
export function routerBeforeEach(
  to: RouteLocation,
  from: RouteLocation | null,
): boolean {
  const blockForm = isBlockFormEnabled() && to.path === "/form";

  const payload = {
    type: "[@dreamer/view 路由卫士] beforeEach",
    to: snapshot(to),
    from: snapshot(from),
    blocked: blockForm,
    reason: blockForm
      ? "演示开关已开启：拦截进入 /form（见 /route-guard 页）"
      : undefined,
  };

  if (blockForm) {
    console.warn(
      "%c[路由拦截]",
      "color:#b45309;font-weight:bold",
      payload,
    );
    return false;
  }

  console.log(
    "%c[路由放行]",
    "color:#047857;font-weight:bold",
    payload,
  );
  return true;
}

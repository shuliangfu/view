/**
 * @module runtime/server
 * @description 工业级服务端渲染 (SSR) 引擎。
 *
 * Deno/Bun 等环境默认无 `document`：在 `renderToString` 等入口内安装极简自研 `document` / `window`
 * （见 `ssr-dom.ts`），使 `jsx-runtime`、`insert`、`template` 与浏览器路径一致；嵌套调用用引用计数配对。
 * 含 `await` 的异步 SSR 经 `queueSsrAsyncTask` 串行化，避免并发覆盖全局 DOM。
 */

import { cleanNode, type Owner, runWithOwner } from "../reactivity/owner.ts";
import { flushPendingSync } from "../scheduler/batch.ts";
import { bumpSsrDomScopeDepth } from "./ssr-scope.ts";
import { resetEventDelegationForSSR } from "./props.ts";
import { installMinimalSsrGlobals } from "./ssr-dom.ts";
import { ssrPromises } from "./ssr-promises.ts";

export { registerSSRPromise, ssrPromises } from "./ssr-promises.ts";

/**
 * 是否为服务端语义环境：无 `window` 或显式 `VIEW_SSR`。
 */
export const isServer = typeof globalThis.window === "undefined" ||
  (globalThis as any).VIEW_SSR === true;

/** `enterSSRDomScope` / `leaveSSRDomScope` 嵌套深度（含「借用」已有 document 的嵌套） */
let ssrDomRefCount = 0;

/** 由本模块安装的 SSR 全局的恢复函数（仅当原先无 `document` 时非空） */
let installedSsrTeardown: (() => void) | null = null;

function globalHasDocument(): boolean {
  return typeof globalThis.document !== "undefined";
}

/**
 * 进入 SSR DOM 作用域：必要时安装极简 `document`/`window` 并递增引用计数。
 * @returns `void`
 */
export function enterSSRDomScope(): void {
  ssrDomRefCount++;
  bumpSsrDomScopeDepth(1);
  if (globalHasDocument()) {
    return;
  }
  if (ssrDomRefCount !== 1) {
    return;
  }
  const { teardown } = installMinimalSsrGlobals();
  installedSsrTeardown = teardown;
  resetEventDelegationForSSR();
}

/**
 * 与 {@link enterSSRDomScope} 配对；引用计数归零时拆除临时全局。
 * @returns `void`
 */
export function leaveSSRDomScope(): void {
  ssrDomRefCount = Math.max(0, ssrDomRefCount - 1);
  bumpSsrDomScopeDepth(-1);
  if (ssrDomRefCount > 0) {
    return;
  }
  if (installedSsrTeardown) {
    installedSsrTeardown();
    installedSsrTeardown = null;
  }
}

/** 异步 SSR 互斥链，避免 `await` 间隙被另一请求覆盖 `document` */
let ssrAsyncChain: Promise<unknown> = Promise.resolve();

/**
 * 将异步任务串入单链，避免并发 SSR 互相覆盖全局 `document`。
 * @template T Promise 结果类型
 * @param task 异步任务
 * @returns 排队执行后的 Promise
 */
export function queueSsrAsyncTask<T>(task: () => Promise<T>): Promise<T> {
  const run = ssrAsyncChain.then(() => task());
  ssrAsyncChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * 将组件渲染为 HTML 字符串。
 *
 * 生命周期：`enterSSRDomScope` → 在 `rootOwner` 下执行 `fn` → `finally` 内先同步排空调度队列，
 * 再对 `rootOwner` 调用 `cleanNode`（释放 `insert`/`createEffect` 等订阅），再次同步排空队列，
 * 最后 `leaveSSRDomScope` 拆除临时 `document`，避免后续 `notify` 在无 DOM 环境下跑 Effect。
 *
 * @param fn 根组件或返回可序列化 UI 的函数
 * @returns HTML 字符串
 */
export function renderToString(fn: () => unknown): string {
  enterSSRDomScope();
  const rootOwner: Owner = { owner: null, disposables: [], children: null };
  try {
    return runWithOwner(rootOwner, () => {
      const result = fn();
      return stringify(result, rootOwner);
    });
  } finally {
    try {
      flushPendingSync();
      /**
       * 必须销毁本次 SSR 的 Owner 子树（含 `insert` 注册的 `createEffect`），否则 Effect 仍挂在 Signal 上；
       * `leaveSSRDomScope` 之后任意 `notify` 会走 microtask `flush`，此时已无 `document`，dweb 等环境下易与 `/ws` 等后续任务交错复现。
       */
      cleanNode(rootOwner, true);
      flushPendingSync();
    } finally {
      leaveSSRDomScope();
    }
  }
}

/**
 * 将内部 SSR 对象转换为 HTML 字符串。
 * @internal
 */
function stringify(v: unknown, owner: Owner | null): string {
  if (v === undefined || v === null) return "";

  if (typeof v === "function") {
    return runWithOwner(owner, () => stringify((v as () => any)(), owner));
  }

  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((item) => stringify(item, owner)).join("");

  // 处理 DOM 节点（自研 SSR DOM / 浏览器）；勿用 `instanceof Node`，Deno 无 DOM 全局时会 ReferenceError
  if (v !== null && typeof v === "object") {
    const domLike = v as {
      nodeType?: number;
      outerHTML?: string;
      textContent?: string | null;
    };
    if (typeof domLike.nodeType === "number") {
      return domLike.outerHTML || domLike.textContent || "";
    }
  }

  // 处理模拟的 ServerNode
  const node = v as {
    _html?: string;
    _attrs?: Record<string, unknown>;
    _class?: unknown;
    _styles?: unknown;
    _children?: unknown[];
    textContent?: string;
  };

  if (node._html) {
    let html = node._html;

    // 1. 序列化属性
    if (node._attrs || node._class || node._styles) {
      let attrStr = "";

      if (node._class) {
        if (typeof node._class === "string") {
          attrStr += ` class="${node._class}"`;
        } else {
          const classes = Object.entries(node._class as Record<string, boolean>)
            .filter(([_, v]) => !!v)
            .map(([k]) => k)
            .join(" ");
          if (classes) attrStr += ` class="${classes}"`;
        }
      }

      if (node._styles) {
        const styleStr = typeof node._styles === "string"
          ? node._styles
          : Object.entries(node._styles as Record<string, unknown>)
            .map(([k, v]) =>
              `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`
            )
            .join(";");
        if (styleStr) attrStr += ` style="${styleStr}"`;
      }

      if (node._attrs) {
        for (const [name, val] of Object.entries(node._attrs)) {
          if (val === true) attrStr += ` ${name}`;
          else if (val !== false && val !== null && val !== undefined) {
            attrStr += ` ${name}="${String(val).replace(/"/g, "&quot;")}"`;
          }
        }
      }

      const index = html.indexOf(">");
      if (index !== -1) {
        const isSelfClosing = html[index - 1] === "/";
        const insertPos = isSelfClosing ? index - 1 : index;
        html = html.slice(0, insertPos) + attrStr + html.slice(insertPos);
      }
    }

    // 2. 递归处理子节点
    if (node._children) {
      const childrenStr = node._children.map((item) => stringify(item, owner))
        .join("");
      html = html.replace("<!--[--><!--]-->", childrenStr);
    } else if (node.textContent) {
      html = html.replace("<!--[--><!--]-->", node.textContent);
    }

    return html;
  }

  return String(v);
}

/**
 * 在 {@link queueSsrAsyncTask} 中执行 SSR，排空 {@link ssrPromises} 后再输出最终 HTML。
 * @param fn 根组件
 * @returns 解析完成的 HTML
 */
export function renderToStringAsync(fn: () => unknown): Promise<string> {
  return queueSsrAsyncTask(async () => {
    ssrPromises.length = 0;
    renderToString(fn);

    while (ssrPromises.length > 0) {
      const promises = [...ssrPromises];
      ssrPromises.length = 0;
      await Promise.all(promises);
    }

    return renderToString(fn);
  });
}

/**
 * 先推送首屏 HTML，再在异步 Promise 批次完成后推送增量片段（当前实现含占位脚本分隔）。
 * @param fn 根组件
 * @returns UTF-8 字节流
 */
export function renderToStream(fn: () => unknown): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        await queueSsrAsyncTask(async () => {
          const initial = renderToString(fn);
          controller.enqueue(encoder.encode(initial));

          while (ssrPromises.length > 0) {
            const promises = [...ssrPromises];
            ssrPromises.length = 0;
            await Promise.all(promises);
            const updated = renderToString(fn);
            controller.enqueue(
              encoder.encode(`<script>/*数据就绪*/</script>${updated}`),
            );
          }
        });
      } catch (e) {
        controller.error(e);
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * 生成在浏览器中 `hydrate` 根节点的内联模块脚本片段（需与构建产物路径一致）。
 * @param id 根元素 `id`
 * @param bindingMap 与客户端一致的绑定表
 * @returns 含 `<script type="module">` 的 HTML 片段
 */
export function generateHydrationScript(
  id: string,
  bindingMap: [number[], string][],
): string {
  return `<script type="module">
    import { hydrate } from "@dreamer/view";
    const root = document.getElementById("${id}");
    if (root) hydrate(root, ${JSON.stringify(bindingMap)});
  </script>`;
}

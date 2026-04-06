/**
 * 子进程入口：必须用 **dweb `view-hybrid/basic` 的 deno.json** 启动，以复现
 * `@dreamer/view/ssr` + `@dreamer/view/jsx-runtime` + `@dreamer/render` 同仓解析方式。
 *
 * ```bash
 * cd dreamer-jsr/dweb/examples/view-hybrid/basic
 * deno run -A --config deno.json ../../../../view/tests/integration/ssr-dweb-smoke-runner.ts
 * ```
 *
 * 断言：`insert` 动态子中 `setSignal` 触发 `schedule` 时，不得在 `leaveSSRDomScope` 后因 microtask 再访问 `document`。
 */

import { createSignal } from "@dreamer/view";
import { renderToString } from "@dreamer/view/ssr";
import { jsx } from "@dreamer/view/jsx-runtime";

const [s, setS] = createSignal(0);
const html = renderToString(() =>
  jsx("div", {
    id: "root",
    children: () => {
      if (s() === 0) setS(1);
      return jsx("span", { id: "dyn", children: String(s()) })();
    },
  })
);

if (!html.includes("dyn") || !html.includes("1")) {
  console.error("[ssr-dweb-smoke] unexpected HTML:", html);
  Deno.exit(1);
}

/** 再等一轮微任务：若仍有「迟到」的 flush，此处会抛或打 log */
await new Promise<void>((r) => queueMicrotask(r));
console.log("[ssr-dweb-smoke] ok", html.length);

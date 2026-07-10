/**
 * 核心热路径基准：Signal / Effect / batch。
 * 运行：`deno task bench` 或 `deno bench -A tests/bench/`
 */
import {
  batch,
  createEffect,
  createRoot,
  createSignal,
} from "../../src/mod.ts";

Deno.bench("signal write + Object.is 同值跳过", () => {
  const s = createSignal(0);
  for (let i = 0; i < 1000; i++) {
    s(0);
  }
});

Deno.bench("signal write 1000 次不同值（无订阅者）", () => {
  const s = createSignal(0);
  for (let i = 0; i < 1000; i++) {
    s(i);
  }
});

Deno.bench("1 signal × 10 effect，batch 内写一次", () => {
  const s = createSignal(0);
  createRoot((dispose) => {
    for (let i = 0; i < 10; i++) {
      createEffect(() => {
        s();
      });
    }
    batch(() => {
      s(1);
    });
    dispose();
  });
});

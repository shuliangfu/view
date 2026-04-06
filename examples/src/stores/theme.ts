/**
 * @module stores/theme
 * @description 主题值 + 持久化；切换逻辑见 `hooks/theme.ts`。
 */
import { createStore } from "@dreamer/view";

export type Theme = "light" | "dark";

/** 纯状态；DOM 同步在 `hooks/theme.ts` 的 toggleTheme / 下方 init */
export const themeStore = createStore(
  "examples-theme-store",
  { theme: "light" as Theme },
  { key: "view-theme" },
);

/** 首屏与 hydrate 后对齐 document class */
if (typeof globalThis.document !== "undefined") {
  globalThis.document.documentElement.classList.toggle(
    "dark",
    themeStore.theme === "dark",
  );
}

/**
 * @module hooks/theme
 * @description 主题切换：改 `themeStore` 并同步 `document.documentElement`。
 */
import { type Theme, themeStore } from "../stores/theme.ts";

/** 当前主题（供布局等读取） */
export function theme(): Theme {
  return themeStore.theme;
}

/**
 * 在 light / dark 间切换，并更新根节点 class。
 */
export function toggleTheme(): void {
  const next = themeStore.theme === "dark" ? "light" : "dark";
  themeStore.theme = next;
  if (typeof globalThis.document !== "undefined") {
    globalThis.document.documentElement.classList.toggle(
      "dark",
      next === "dark",
    );
  }
}

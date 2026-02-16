/**
 * 主题：light / dark，使用 createStore + persist 持久化到 localStorage，
 * 并同步到 document.documentElement.classList（Tailwind class 策略）。
 */

import { createStore, withActions } from "@dreamer/view/store";

export type Theme = "light" | "dark";

/** 主题 state 类型（满足 createStore 的 Record<string, unknown> 约束） */
type ThemeState = Record<string, unknown> & { theme: Theme };

/** 主题 actions 类型，供 withActions 使用以便在 action 内直接写 this.setTheme / this.toggleTheme，便于 IDE 识别与代码跟踪 */
type ThemeActions = {
  setTheme(next: Theme): void;
  toggleTheme(): void;
};

function applyToDom(theme: Theme): void {
  if (typeof globalThis.document === "undefined") return;
  const root = globalThis.document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/**
 * 主题 store：有 actions 时 createStore 默认返回对象，可 themeStore.theme 读、themeStore.toggleTheme() 调方法。
 * 在组件中用 () => themeStore.theme 可响应式更新。
 */
export const themeStore = createStore("theme", {
  state: { theme: "light" as Theme } as ThemeState,
  actions: withActions<ThemeState, ThemeActions>()({
    setTheme(next: Theme) {
      this.theme = next;
      applyToDom(next);
    },
    toggleTheme() {
      const next = this.theme === "dark" ? "light" : "dark";
      this.setTheme(next);
    },
  }),
  persist: { key: "view-theme" },
});

// 初始化时根据 store 中已恢复的值同步到 DOM（persist 会先于此处从 localStorage 恢复）
applyToDom(themeStore.theme);

/** 当前主题（只读），在组件中调用 theme() 可响应式读取 */
export function theme(): Theme {
  return themeStore.theme;
}

/** 设置主题并持久化、同步到 DOM */
export const setTheme = themeStore.setTheme;

/** 在 light / dark 之间切换 */
export const toggleTheme = themeStore.toggleTheme;

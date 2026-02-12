/**
 * 主题：light / dark，使用 createStore + persist 持久化到 localStorage，
 * 并同步到 document.documentElement.classList（Tailwind class 策略）。
 */

import { createStore } from "@dreamer/view/store";

export type Theme = "light" | "dark";

/** 主题 state 类型（满足 createStore 的 Record<string, unknown> 约束） */
type ThemeState = Record<string, unknown> & { theme: Theme };

function applyToDom(theme: Theme): void {
  if (typeof globalThis.document === "undefined") return;
  const root = globalThis.document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

const [get, _set, actions] = createStore({
  state: { theme: "light" as Theme } as ThemeState,
  actions: {
    setTheme(
      get: () => ThemeState,
      set: (v: ThemeState | ((p: ThemeState) => ThemeState)) => void,
      ...args: unknown[]
    ) {
      const next = args[0] as Theme;
      set({ ...get(), theme: next });
      applyToDom(next);
    },
    toggleTheme(
      get: () => ThemeState,
      set: (v: ThemeState | ((p: ThemeState) => ThemeState)) => void,
    ) {
      const next = get().theme === "dark" ? "light" : "dark";
      set({ ...get(), theme: next });
      applyToDom(next);
    },
  },
  persist: { key: "view-theme" },
});

// 初始化时根据 store 中已恢复的值同步到 DOM（persist 会先于此处从 localStorage 恢复）
applyToDom(get().theme);

/** 当前主题（只读），在组件中调用 theme() 可响应式读取 */
export function theme(): Theme {
  return get().theme;
}

/** 设置主题并持久化、同步到 DOM */
export const setTheme = actions.setTheme;

/** 在 light / dark 之间切换 */
export const toggleTheme = actions.toggleTheme;

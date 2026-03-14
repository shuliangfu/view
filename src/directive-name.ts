/**
 * 指令名规范化：kebab ⇄ camel，集中维护一处，供 directive 等模块引用。
 *
 * @module @dreamer/view/directive-name
 */

/**
 * 将模板风格指令名转为 camelCase（如 v-if -> vIf）。
 *
 * @param name - 指令名（如 "v-if" 或 "vIf"）
 * @returns 驼峰形式
 */
export function directiveNameToCamel(name: string): string {
  if (name.startsWith("v-")) {
    const rest = name.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return "v" + rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return name;
}

/**
 * 将 camelCase 指令名转为短横线形式（如 vIf -> v-if）。
 *
 * @param name - 驼峰指令名
 * @returns 短横线形式
 */
export function directiveNameToKebab(name: string): string {
  if (name.startsWith("v") && name.length > 1) {
    const rest = name.slice(1).replace(
      /([A-Z])/g,
      (_, c) => `-${c.toLowerCase()}`,
    );
    return "v" + rest;
  }
  return name;
}

/**
 * 路由 `metadata` 与 `<head>` 同步：服务端可注入 SEO 片段，浏览器在路由切换时更新 `document.title` 与 meta。
 *
 * @module integrations/meta
 */

import { escapeForAttrHtml } from "../utils/escape.ts";

/**
 * 根据 metadata 生成可插入 `<head>` 的 HTML 字符串（供 SSR / dev 注入首屏）。
 *
 * @param metadata 路由表上的 metadata
 * @param titleSuffix 追加在 title 后的后缀（如 ` | 站点名`）
 * @param fallbackTitle 无 `metadata.title` 时的后备（常用为 path）
 */
export function getMetaHeadFragment(
  metadata: Record<string, unknown> | undefined,
  titleSuffix = "",
  fallbackTitle = "",
): string {
  const title = (metadata?.title as string)?.trim() ||
    (fallbackTitle as string)?.trim() ||
    "";
  const parts: string[] = [];
  if (title) {
    parts.push(`<title>${escapeForAttrHtml(title + titleSuffix)}</title>`);
  }
  const push = (attr: "name" | "property", key: string, value: unknown) => {
    const s = value != null && typeof value !== "string"
      ? String(value)
      : value;
    if (typeof s !== "string" || !s.trim()) return;
    parts.push(
      `<meta ${attr}="${escapeForAttrHtml(key)}" content="${
        escapeForAttrHtml(s)
      }">`,
    );
  };
  if (metadata && typeof metadata === "object") {
    for (const key of Object.keys(metadata)) {
      if (key === "title" || key === "og") continue;
      push("name", key, metadata[key]);
    }
  }
  const og = metadata?.og;
  if (og != null && typeof og === "object" && !Array.isArray(og)) {
    const o = og as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      push("property", key.startsWith("og:") ? key : `og:${key}`, o[key]);
    }
  }
  return parts.join("\n");
}

/**
 * 在 `document.head` 中设置或更新单个 meta（`name` 或 `property`），仅浏览器环境。
 */
function setMetaTag(
  attr: "name" | "property",
  key: string,
  value: unknown,
): void {
  const s = value != null && typeof value !== "string" ? String(value) : value;
  if (typeof s !== "string" || !s.trim()) return;
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.head) return;
  let el = doc.querySelector(`meta[${attr}="${key}"]`) as
    | HTMLMetaElement
    | null;
  if (!el) {
    el = doc.createElement("meta");
    el.setAttribute(attr, key);
    doc.head.appendChild(el);
  }
  el.setAttribute("content", s);
}

/**
 * 将路由 metadata 写入 `document`：`title`、`description`、`keywords`、`author`、`og:*` 等。
 * 由 {@link createRouter} 在命中变化时调用。
 *
 * @param metadata 当前路由的 metadata
 * @param titleSuffix 标题后缀
 * @param fallbackTitle 无 title 时的后备
 */
export function applyMetaToHead(
  metadata: Record<string, unknown> | undefined,
  titleSuffix = "",
  fallbackTitle = "",
): void {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.head) return;

  const title = (metadata?.title as string)?.trim() ||
    (fallbackTitle as string)?.trim() ||
    "";
  if (title) {
    doc.title = title + titleSuffix;
  }

  if (metadata && typeof metadata === "object") {
    for (const key of Object.keys(metadata)) {
      if (key === "title" || key === "og") continue;
      setMetaTag("name", key, metadata[key]);
    }
  }
  const og = metadata?.og;
  if (og != null && typeof og === "object" && !Array.isArray(og)) {
    const o = og as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      const propKey = key.startsWith("og:") ? key : `og:${key}`;
      setMetaTag("property", propKey, o[key]);
    }
  }
}

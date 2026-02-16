/**
 * @module @dreamer/view/meta
 * @description
 * 路由 metadata 渲染到 <head>：供开发/构建服务端注入首屏 SEO，以及客户端路由切换时更新 document。与模板引擎无关，仅在 view 的 cmd（dev/build/serve）及 router 中使用。
 *
 * **本模块导出：**
 * - `getMetaHeadFragment(metadata, titleSuffix?, fallbackTitle?)`：生成要插入 head 的 HTML 片段（服务端用）
 * - `applyMetaToHead(metadata, titleSuffix?, fallbackTitle?)`：将 metadata 同步到 document.head（浏览器用）
 */

/** 对字符串做 HTML 转义，避免注入 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 根据 metadata 生成要插入 <head> 的 HTML 片段（供服务端 dev/build 注入首屏）
 * @param metadata 路由 metadata
 * @param titleSuffix 标题后缀
 * @param fallbackTitle 无 metadata.title 时的后备标题（如 path）
 * @returns 可直接插入 head 的 HTML 字符串
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
    parts.push(`<title>${escapeHtml(title + titleSuffix)}</title>`);
  }
  const push = (attr: "name" | "property", key: string, value: unknown) => {
    const s = value != null && typeof value !== "string"
      ? String(value)
      : value;
    if (typeof s !== "string" || !s.trim()) return;
    parts.push(
      `<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(s)}">`,
    );
  };
  // 遍历 metadata 下除 title、og 外的所有字段，支持用户自定义 name 类 meta
  if (metadata && typeof metadata === "object") {
    for (const key of Object.keys(metadata)) {
      if (key === "title" || key === "og") continue;
      push("name", key, metadata[key]);
    }
  }
  // 遍历 metadata.og 下所有字段，支持用户自定义 property 类 meta（如 og:image:width）
  const og = metadata?.og;
  if (og != null && typeof og === "object" && !Array.isArray(og)) {
    const o = og as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      push("property", key.startsWith("og:") ? key : `og:${key}`, o[key]);
    }
  }
  return parts.join("\n");
}

/** 在 head 中设置或更新单个 meta 标签（name 或 property），仅浏览器环境 */
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
 * 将路由 metadata 同步到 document.head：title、description、keywords、author、og:*
 * 供 router 在导航后及 start() 时调用（浏览器环境）。
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

  // 遍历 metadata 下除 title、og 外的所有字段，支持用户自定义 name 类 meta
  if (metadata && typeof metadata === "object") {
    for (const key of Object.keys(metadata)) {
      if (key === "title" || key === "og") continue;
      setMetaTag("name", key, metadata[key]);
    }
  }
  // 遍历 metadata.og 下所有字段，支持用户自定义 property 类 meta
  const og = metadata?.og;
  if (og != null && typeof og === "object" && !Array.isArray(og)) {
    const o = og as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      const propKey = key.startsWith("og:") ? key : `og:${key}`;
      setMetaTag("property", propKey, o[key]);
    }
  }
}

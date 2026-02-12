/**
 * 示例静态服务（带 SPA fallback）
 *
 * 静态资源按路径返回；无对应文件时返回 index.html，便于 history 模式路由在刷新或直接访问时仍能加载前端并由 router 接管。
 * 用法：在 examples 目录下执行 deno run -A server.ts
 */

const PORT = Number(Deno.env.get("PORT")) || 8787;
/** 示例目录（与 server.ts 同目录），用于解析相对路径 */
const ROOT_URL = new URL(".", import.meta.url);

/** 根据扩展名返回常见 MIME 类型 */
function getContentType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".woff2")) return "font/woff2";
  if (path.endsWith(".woff")) return "font/woff";
  return "application/octet-stream";
}

/** 解析请求路径为安全相对路径（禁止 .. 跳出根目录） */
function resolvePath(urlPath: string): string {
  const decoded = decodeURIComponent(urlPath);
  const segments = decoded.replace(/^\/+/, "").split("/").filter(Boolean);
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === "..") {
      resolved.pop();
    } else if (seg !== ".") {
      resolved.push(seg);
    }
  }
  return resolved.join("/") || "index.html";
}

/** 返回 index.html 的 Response（SPA fallback） */
async function serveIndexHtml(): Promise<Response> {
  const indexUrl = new URL("index.html", ROOT_URL);
  const html = await Deno.readFile(indexUrl);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const path = resolvePath(url.pathname);
  const fileUrl = new URL(path, ROOT_URL);

  try {
    const info = await Deno.stat(fileUrl);
    if (!info.isFile) {
      return serveIndexHtml();
    }
    const body = await Deno.readFile(fileUrl);
    return new Response(body, {
      headers: { "content-type": getContentType(path) },
    });
  } catch {
    return serveIndexHtml();
  }
});

console.log(`Server with SPA fallback: http://localhost:${PORT}`);

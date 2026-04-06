/**
 * @module runtime/template
 * @description 模板克隆引擎 - 用于高效的 DOM 节点复用。
 *
 * **支持的功能：**
 * - ✅ template() - 创建可复用的模板函数
 * - ✅ 服务器端渲染支持 (SSR)
 * - ✅ 客户端模板克隆
 * - ✅ 环境判断 (server vs client)
 *
 * **核心机制：**
 * - 模板字符串转 DOM 节点
 * - 服务器端 vs 客户端不同处理
 * - 高效的节点克隆 (cloneNode)
 *
 * **范围说明：**
 * - **编译期优化**（静态分析、指令合并等）在 `compiler/`，不在本 runtime 文件。
 * - **运行时「换一段 HTML 再渲染」**属于另一套 API（需重新 `insert`/更新 DOM），本模块的 `template()` 只提供「静态片段 + 克隆」。
 * - **缓存**：见下方 `clientTemplateByHtml`：相同字符串多次调用 `template()` 时复用已解析的根节点，避免重复 `innerHTML`。
 * - **walk**：路径下标越界时抛错，便于编译产物与 DOM 不一致时快速失败。
 *
 * @usage
 * const tmpl = template(`<div class="item"></div>`)
 * const node = tmpl()
 */

/**
 * 是否为「无 DOM」或显式 SSR 环境（与 `walk` 共用，避免重复判断逻辑）。
 */
function isServerLikeEnvironment(): boolean {
  return typeof globalThis.document === "undefined" ||
    (globalThis as any).VIEW_SSR === true;
}

/**
 * 客户端：按模板字符串复用「已解析的根节点」，避免相同 HTML 多次走 `innerHTML`。
 * 键为编译器传入的完整片段字符串；模板种类有限，Map 规模可接受。
 */
const clientTemplateByHtml = new Map<string, () => Node>();

/**
 * 编译器生成的组件模板。
 */
export function template(html: string) {
  const server = isServerLikeEnvironment();

  if (server) {
    return () => ({
      _html: html,
      cloneNode: () => ({ _html: html }),
      toString: () => html,
    } as any);
  }

  const cached = clientTemplateByHtml.get(html);
  if (cached) return cached;

  const isSVG = html.startsWith("<svg") || html.startsWith("<g") ||
    html.startsWith("<path");

  const container = document.createElement("div");
  if (isSVG) {
    container.innerHTML = `<svg>${html}</svg>`;
  } else {
    container.innerHTML = html;
  }

  let node = isSVG ? container.firstChild!.firstChild! : container.firstChild!;

  // 跳过可能的文本节点
  while (node && node.nodeType !== 1) {
    node = node.nextSibling!;
  }

  const finalNode = node;
  const cloneFn = () => finalNode.cloneNode(true);
  clientTemplateByHtml.set(html, cloneFn);
  return cloneFn;
}

/**
 * 节点寻址。
 * 路径下标越界时抛出明确错误，避免静默得到 `undefined` 后在后续逻辑里难排查。
 */
export function walk(root: Node, path: number[]): Node {
  if (isServerLikeEnvironment()) return root;

  let current = root;
  for (let i = 0; i < path.length; i++) {
    const children = current.childNodes;
    const idx = path[i]!;
    if (idx < 0 || idx >= children.length) {
      throw new Error(
        `[@dreamer/view] walk: 路径片段 ${idx} 越界（段下标 ${i}，当前子节点数 ${children.length}）`,
      );
    }
    current = children[idx]!;
  }
  return current;
}

# Bun 兼容说明（@dreamer/view）

## 支持面

| 场景                      | 状态         | 说明                                                            |
| ------------------------- | ------------ | --------------------------------------------------------------- |
| 单元/集成测试             | ✅           | `bun test tests/` — `bunfig.toml` 预载 `dom-setup`（happy-dom） |
| CSR（浏览器）             | ✅           | 与 Deno 同源；无 Bun 专用分支                                   |
| SSR（无 document）        | ✅（2.0.5+） | 自研 `ssr-dom`，**不依赖** happy-dom                            |
| dweb hybrid `bun run dev` | ✅（2.0.5+） | 依赖 SSR 伪 DOM 完整 Element API                                |

## 2.0.6 工具链

- 根目录 **`bunfig.toml`**：`[test] preload = ["./tests/unit/dom-setup.ts"]`，
  使裸 `bun test` 与 Deno 隔离环境一致（DOM + registry 重置）。缺少 preload 时
  Bun 隔离下部分单测会失败。

## 2.0.5 修复与 SSR 伪 DOM 补全

在 **Deno 与 Bun 默认均无浏览器 `document`** 时，`renderToString` 会安装极简
`SsrElement`。

若缺 `hasAttribute`，`setProperty` 在属性为 `null`/`undefined` 时会：

```text
TypeError: el.hasAttribute is not a function
```

dweb hybrid 在服务端渲染首页时必现。**2.0.5** 除修复该崩溃外，尽量对齐常用
Element/Document API，降低再踩洞概率：

| 类别     | 已提供（摘要）                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| 属性     | `hasAttribute` / `get/set/remove/toggleAttribute`、NS 变体、`id`/`name`/`type`/`href`/`src`/`disabled`/`tabIndex` |
| 样式     | `style.cssText`、`setProperty`、`removeProperty`、`getPropertyValue`                                              |
| 结构     | `appendChild`/`insertBefore`/`removeChild`/`replaceChild`、`append`/`prepend`/`before`/`after`/`replaceWith`      |
| 查询     | `matches`/`closest`/`querySelector(All)`、`getElementById`、`classList`、`dataset`                                |
| 节点     | `nodeName`/`parentElement`/`isConnected`/`contains`/`children`/`firstElementChild`                                |
| document | `head`/`body`、`importNode`、`defaultView`、事件空操作                                                            |

**非目标**：完整浏览器 CSS 选择器引擎、布局几何（`getBoundingClientRect`
等）、真实事件冒泡。

## 测试建议

```bash
# Bun（推荐与 CI 一致；依赖 bunfig preload）
bun test tests/unit tests/integration

# 无 happy-dom 的 SSR 契约（文件内自管 document）
bun test tests/unit/runtime/ssr-dom-element-api.test.ts

# Deno
deno test -A tests/unit tests/integration
```

## 与 dweb 协作

- dweb 依赖 `@dreamer/view@^2.0.4` 时，装到 **≥2.0.5** 即含 SSR 伪 DOM 修复；
  **≥2.0.6** 含 props/URL 安全与 For LIS 等运行时优化。
- 验证：`cd examples/view-hybrid/basic && bun run dev`，访问首页日志中**不应再出现**
  `hasAttribute`。

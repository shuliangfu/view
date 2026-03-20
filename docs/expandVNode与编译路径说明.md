# expandVNode 与编译路径（已全面删除，仅作说明）

## 一、现状（已全面按新架构）

- **路线 C**：客户端已统一为「全量 .tsx 编译 + mount + insert」；**renderVNode
  已删除**；**insert 不再处理 VNode**；**expandVNode 已全部删除**（原
  dom/element、dom/hydrate 内 VNode→DOM 与旧水合路径已移除）。
- **dom/element**：仅保留 `normalizeChildren` 与 `ChildItem`
  类型（类型/兼容用）；**dom/hydrate.ts 已删除**。
- **examples**：入口为 `mount("#root", (el) => getRoot(router)(el))`，所有 .tsx
  由构建编译，根与子组件均返回 `(parent) => void`。

## 二、当前 examples 约定

1. **构建**：对**所有** `.tsx` 在 onLoad 阶段执行 `compileSource`，将文件中每个
   `return <JSX>` 替换为 `return (parent) => { insert(parent, ...) }`。
2. **入口**：`mount("#root", (el) => getRoot(router)(el))`，getRoot 定义在
   main.tsx 内，编译后返回 `(parent) => void`。
3. **路由/懒加载**：所有 .tsx（含路由页、Layout、RoutePage
   等）均被编译，组件均返回 `(parent) => void`，不再经 expandVNode。

## 三、main.tsx 写法示例（根写在入口内并参与编译）

### 3.1 当前约定

- **main.tsx**：入口，含 `getRoot(router) { return <App router={router} /> }` 与
  `mount("#root", (el) => getRoot(router)(el))`。
- 构建时对 **main.tsx** 执行 `compileSource`，仅替换其中**第一个**
  `return <JSX>`（即 getRoot 内的 return），产出
  `return (parent) => { insert(parent, ...) }`。

### 3.2 main.tsx 示例

```tsx
// examples/src/main.tsx — 构建时对本文件执行 compileSource
import { mount } from "@dreamer/view";
import { registerDirective } from "@dreamer/view/directive";
import type { Router } from "@dreamer/view/router";
import "./assets/global.css";
import { createAppRouter } from "./router/router.ts";
import { notFoundRoute, routes } from "./router/routers.tsx";
import { App } from "./views/_app.tsx";

registerDirective("v-focus", { ... });
registerDirective("v-copy", { ... });

function getRoot(router: Router) {
  return <App router={router} />;  // 编译后变为 return (parent) => { insert(parent, ...); }
}

const router = createAppRouter({ routes, notFound: notFoundRoute });
mount("#root", (el) => getRoot(router)(el), { noopIfNotFound: true });
```

### 3.3 小结

- **renderVNode、expandVNode、dom/hydrate 已删除**；insert 仅支持
  `(parent) => void`/string/number/Node，根与子组件均通过「全量 .tsx 编译 +
  insert」建立，框架已按新架构轻量化。

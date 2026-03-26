/**
 * JSX 编译器（compileSource）单元测试：将 JSX 转为 insert/createElement 调用。
 * 不依赖 DOM，无需 dom-setup，避免 happy-dom 内部定时器触发 Leaks detected。
 */

import { describe, expect, it } from "@dreamer/test";
import { compileSource } from "@dreamer/view/jsx-compiler";

describe("jsx-compiler", () => {
  it("compileSource 应将 return <div>{expr}</div> 转为含 insert 与 createElement 的代码", () => {
    const source = `
function App() {
  return <div id="a">{count()}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toContain("insert");
    expect(out).toContain("createElement");
    expect(out).toContain('"div"');
    expect(out).toContain("__viewMountParent");
    expect(out).toContain("count()");
  });

  /**
   * `return new Promise((resolve)=>{ ... resolve(<Jsx/>) })` 只应递归变换内层 JSX；
   * 若把整段 return 包成 `(parent)=>insertReactive(parent, ()=>…)`，则得到非 thenable，Suspense/async 信号会失效（examples boundary）。
   */
  it("compileSource：return new Promise 内 resolve JSX 时顶层仍为 new Promise", () => {
    const source = `
import type { VNode } from "@dreamer/view";
export function makeP(): Promise<VNode> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(<span className="x">ok</span>);
    }, 1);
  });
}
`;
    const out = compileSource(source, "defer-jsx.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("return new Promise(");
    expect(out).not.toContain("insertReactive(parent, () => new Promise");
  });

  it("compileSource 应注入 insert 与 insertReactive 的 import 若不存在", () => {
    const source = `function App() { return <span>hi</span>; }`;
    const out = compileSource(source);
    expect(out).toContain(
      'import { insert, insertReactive, getActiveDocument, markMountFn } from "@dreamer/view/compiler"',
    );
    expect(out).toContain("createElement");
  });

  /**
   * React 等 常见 `items?.map`：短路为 `undefined` 时须走 insertReactive 数组空分支；编译期包
   * `coalesceIrList`（与手写 `list() ?? []` 同向）。
   */
  /**
   * 常见 `show && list?.map`：可选链在 `&&` 右侧，须在子树内包 coalesce。
   */
  it("compileSource：{cond && items?.map(...)} 应对 map 调用包 coalesceIrList", () => {
    const source = `
function T() {
  const show = true;
  const items: { id: number }[] | undefined = [];
  return <ul>{show && items?.map((row) => <li key={row.id}>{String(row.id)}</li>)}</ul>;
}
`;
    const out = compileSource(source, "AndOptMap.tsx");
    expect(out).toContain("coalesceIrList(");
    expect(out).toMatch(/&&[\s\S]*items\?\.map/);
  });

  /**
   * 可选链 + 计算属性名 `?.['map']`，与点写法等价，须同样包 coalesce。
   */
  it("compileSource：{items?.['map'](...)} 应包 coalesceIrList", () => {
    const source = `
function M() {
  const items: { id: number }[] | undefined = [];
  return <ul>{items?.["map"]((row) => <li key={row.id}>{String(row.id)}</li>)}</ul>;
}
`;
    const out = compileSource(source, "BracketMap.tsx");
    expect(out).toContain("coalesceIrList(");
    expect(out).toMatch(/\[\s*["']map["']\s*\]/);
  });

  /**
   * 嵌套列表：`rows?.map` 回调为表达式体，内层 `row.sub?.map` 也须 coalesce（与同类方案 嵌套 For/map 写法一致）。
   */
  it("compileSource：{rows?.map(row => row.sub?.map(...))} 应对内外可选链列表均包 coalesce", () => {
    const source = `
function Nested() {
  const rows: { sub?: { id: number }[] }[] | undefined = [];
  return (
    <ul>
      {rows?.map((row) =>
        row.sub?.map((s) => <li key={s.id}>{String(s.id)}</li>)
      )}
    </ul>
  );
}
`;
    const out = compileSource(source, "NestedOptMap.tsx");
    const n = (out.match(/coalesceIrList/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(out).toContain("rows?.map");
    expect(out).toMatch(/sub\?\.map/);
  });

  /**
   * 块体单 return：`(row) => { return row.sub?.map(...); }` 内层也须 coalesce（常见多行回调）。
   */
  it("compileSource：rows?.map(row => { return row.sub?.map(...) }) 应对内外包 coalesce", () => {
    const source = `
function BlockRet() {
  const rows: { sub?: { id: number }[] }[] | undefined = [];
  return (
    <ul>
      {rows?.map((row) => {
        return row.sub?.map((s) => <li key={s.id}>{String(s.id)}</li>);
      })}
    </ul>
  );
}
`;
    const out = compileSource(source, "BlockReturnOptMap.tsx");
    const n = (out.match(/coalesceIrList/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(out).toContain("rows?.map");
    expect(out).toMatch(/sub\?\.map/);
  });

  /**
   * `<For>``：子节点须为 render prop；`each={items.value}` 须编译为 `each: () => items.value` 以在 `mapArray` 内订阅 signal。
   */
  it("compileSource：<For> 应对 each 包无参 accessor 并调用 For(", () => {
    const source = `
import { For, createSignal } from "@dreamer/view";
function List() {
  const items = createSignal<number[]>([1]);
  return (
    <ul>
      <For each={items.value} fallback={<li>empty</li>}>
        {(n) => <li>{String(n)}</li>}
      </For>
    </ul>
  );
}
`;
    const out = compileSource(source, "ControlFlowFor.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("For(");
    expect(out).toMatch(/each:\s*\(\)\s*=>/);
  });

  /** `<Index>` 与 `<For>` 共用编译分支 */
  it("compileSource：<Index> 应对 each 包 accessor", () => {
    const source = `
import { Index, createSignal } from "@dreamer/view";
function L() {
  const items = createSignal([1]);
  return <Index each={items.value}>{(x) => <span>{String(x)}</span>}</Index>;
}
`;
    const out = compileSource(source, "ControlFlowIndex.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("Index(");
    expect(out).toMatch(/each:\s*\(\)\s*=>/);
  });

  /**
   * `<Show>`：`when={expr}` 须为 `when: () => expr`；与 `vIf` 并存。
   */
  it("compileSource：<Show> 应对 when 包无参 accessor 并调用 Show(", () => {
    const source = `
import { Show, createSignal } from "@dreamer/view";
function Panel() {
  const ok = createSignal(false);
  return (
    <Show when={ok.value} fallback={<span>no</span>}>
      {(v) => <span>{String(v)}</span>}
    </Show>
  );
}
`;
    const out = compileSource(source, "ControlFlowShow.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("Show(");
    expect(out).toMatch(/when:\s*\(\)\s*=>/);
  });

  /**
   * `<Switch>`：子级 `<Match when={…}>` 编成 `matches`，且各 `when` 为 accessor。
   */
  it("compileSource：<Switch> 应产出 matches 且 Match 的 when 包 accessor", () => {
    const source = `
import { Switch, Match, createSignal } from "@dreamer/view";
function Routes() {
  const r = createSignal<"x"|"y">("x");
  return (
    <Switch fallback={<span>z</span>}>
      <Match when={r.value === "x"}>
        {(v) => <span>{String(v)}</span>}
      </Match>
      <Match when={r.value === "y"}>
        <span>y</span>
      </Match>
    </Switch>
  );
}
`;
    const out = compileSource(source, "ControlFlowSwitch.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("Switch(");
    expect(out).toContain("matches:");
    expect(out).toMatch(/when:\s*\(\)\s*=>/);
  });

  /**
   * `<Dynamic>`：`component={expr}` 须为 `component: () => expr`。
   */
  it("compileSource：<Dynamic> 应对 component 包无参 accessor 并调用 Dynamic(", () => {
    const source = `
import { Dynamic, createSignal } from "@dreamer/view";
function X() {
  const T = createSignal<"span" | "em">("span");
  return <Dynamic component={T.value} className="c" />;
}
`;
    const out = compileSource(source, "ControlFlowDynamic.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("Dynamic(");
    expect(out).toMatch(/component:\s*\(\)\s*=>/);
  });

  /**
   * 根级 **`+` 拼接等非单 JSX 根** 走 {@link wrapExpressionContainingJsxAsRootMountFn}：`Fragment` 内静态 + 动态时拆成 **`insert` + `insertReactive`**。
   */
  it("compileSource：字符串拼接根 Fragment 静态+动态子应 insert 与 insertReactive 并存", () => {
    const source = `
import { createSignal } from "@dreamer/view";
export function SplitFrag() {
  const n = createSignal(0);
  return "" + (<> <b>ok</b> {n.value} </>);
}
`;
    const out = compileSource(source, "SplitFrag.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("insert(parent");
    expect(out).toContain("insertReactive(parent");
  });

  /**
   * 根级 **`"" + <div>…</div>`** 走本征剥壳：`insert(parent, markMountFn…)`，子级仍可对动态子用 `insertReactive`（形参为元素变量而非 `parent`）。
   */
  it("compileSource：字符串拼接本征根应根级 insert(parent 且无 insertReactive(parent", () => {
    const source = `
import { createSignal } from "@dreamer/view";
export function SplitDiv() {
  const n = createSignal(0);
  return "" + (<div class="w"><b>ok</b>{n.value}</div>);
}
`;
    const out = compileSource(source, "SplitDiv.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("insert(parent");
    expect(out).toContain("insertReactive(");
    expect(out).not.toContain("insertReactive(parent");
  });

  /**
   * 本征子级 **`{ <>…</> }`**：与根级 Fragment 分段同向，静态段 `insert`、动态段 `insertReactive`，缩小单一 getter 粒度。
   */
  it("compileSource：本征子级 Fragment 花括号内静动混合应 insert 与 insertReactive 分段", () => {
    const source = `
import { createSignal } from "@dreamer/view";
export function Page() {
  const n = createSignal(0);
  return <div className="w">{<> <b>ok</b> {n.value} </>}</div>;
}
`;
    const out = compileSource(source, "FragBrace.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("insert(");
    expect(out).toContain("insertReactive(");
    expect(out).toMatch(/insert\([\s\S]*markMountFn/);
  });

  /**
   * **`{ <div>静…动…</div> }`**：外层一次创建 div，子级静/动分段，避免整段单一 `insertReactive`。
   */
  it("compileSource：本征子级 div 花括号内子节点静动混合应内层 insert 与 insertReactive 分段", () => {
    const source = `
import { createSignal } from "@dreamer/view";
export function Page() {
  const n = createSignal(0);
  return <section>{ <div className="box"><b>ok</b>{n.value}</div> }</section>;
}
`;
    const out = compileSource(source, "InnerDivBrace.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain('createElement("div")');
    expect(out).toContain("insert(");
    expect(out).toContain("insertReactive(");
  });

  /**
   * **`{ cond && <>静…动…</> }`**：外层 `insertReactive` 仅依赖 `cond`；为真时内层再 `insert` + `insertReactive` 分段（短路语义 + 子级分段）。
   */
  it("compileSource：show && Fragment 静动混合应外层 insertReactive 且内层 insert 与 insertReactive 分段", () => {
    const source = `
import { createSignal } from "@dreamer/view";
export function Page() {
  const show = createSignal(true);
  const n = createSignal(0);
  return <div>{show.value && <> <b>ok</b> {n.value} </>}</div>;
}
`;
    const out = compileSource(source, "AndFrag.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("insertReactive(");
    expect(out).toContain("insert(");
    expect(out).toMatch(/markMountFn/);
    /** 内层 mount 应对 `__viewMountParent` 分段，而非整段单一 reactive */
    expect(out).toContain("__viewMountParent");
  });

  /**
   * **`{ cond && <div>静…动…</div> }`**：与本征花括号分段同向，但 **cond** 单独包在外层 getter。
   */
  it("compileSource：show && div 子级静动混合应短路外层 reactive 且内层分段", () => {
    const source = `
import { createSignal } from "@dreamer/view";
export function Page() {
  const show = createSignal(true);
  const n = createSignal(0);
  return <section>{show.value && <div className="box"><b>ok</b>{n.value}</div>}</section>;
}
`;
    const out = compileSource(source, "AndDiv.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain('createElement("div")');
    expect(out).toContain("insertReactive(");
    expect(out).toContain("insert(");
    expect(out).toContain("__viewMountParent");
  });

  /**
   * **`{ label || <>静…动…</> }`**：左侧假值时内层分段；真值时返回左侧展示（与 `||` 一致）。
   */
  it("compileSource：falsy || Fragment 静动混合应内层 insert 与 insertReactive 且含 __viewMountParent", () => {
    const source = `
import { createSignal } from "@dreamer/view";
export function Page() {
  const label = createSignal("");
  const n = createSignal(0);
  return <div>{label.value || <> <b>ok</b> {n.value} </>}</div>;
}
`;
    const out = compileSource(source, "OrFrag.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("insertReactive(");
    expect(out).toContain("insert(");
    expect(out).toContain("__viewMountParent");
    expect(out).toMatch(/const\s+\w+\s*=\s*label\.value/);
  });

  /**
   * **`{ value ?? <div>静…动…</div> }`**：nullish 时内层分段；否则展示左侧（`!= null` 择支）。
   */
  it("compileSource：nullish ?? div 子级静动混合应短路择支且内层分段", () => {
    const source = `
import { createSignal } from "@dreamer/view";
export function Page() {
  const value = createSignal<string | undefined>(undefined);
  const n = createSignal(0);
  return <article>{value.value ?? <div className="box"><b>ok</b>{n.value}</div>}</article>;
}
`;
    const out = compileSource(source, "NullishDiv.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain('createElement("div")');
    expect(out).toContain("insertReactive(");
    expect(out).toContain("insert(");
    expect(out).toContain("__viewMountParent");
    expect(out).toMatch(/!=\s*null/);
  });

  /**
   * 函数级依赖图：非 createSignal 的简单标识符插值可走 `insert`，避免子级 `insertReactive`。
   */
  it("compileSource：const 字符串插值子应无 insertReactive 调用", () => {
    const source = `
import { createSignal } from "@dreamer/view";
export function HoistLabel() {
  const label = "hi";
  return <div>{label}</div>;
}
`;
    const out = compileSource(source, "HoistLabel.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect((out.match(/insertReactive\(/g) ?? []).length).toBe(0);
  });

  /**
   * signal 的 `.value` 仍须 `insertReactive`。
   */
  it("compileSource：signal.value 插值仍出现 insertReactive", () => {
    const source = `
import { createSignal } from "@dreamer/view";
export function Sig() {
  const n = createSignal(0);
  return <div>{n.value}</div>;
}
`;
    const out = compileSource(source, "Sig.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect((out.match(/insertReactive\(/g) ?? []).length)
      .toBeGreaterThanOrEqual(
        1,
      );
  });

  /**
   * 块内多条语句、末条 `return row.sub?.map`：只改写 return 表达式，须内外 coalesce。
   */
  it("compileSource：rows?.map(row => { const k=...; return row.sub?.map(...) }) 应包 coalesce", () => {
    const source = `
function MultiStmt() {
  const rows: { id: number; sub?: { id: number }[] }[] | undefined = [];
  return (
    <ul>
      {rows?.map((row) => {
        const k = row.id;
        return row.sub?.map((s) => <li key={s.id}>{String(k)}-{String(s.id)}</li>);
      })}
    </ul>
  );
}
`;
    const out = compileSource(source, "MultiStmtOptMap.tsx");
    const n = (out.match(/coalesceIrList/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(out).toContain("const k = row.id");
    expect(out).toMatch(/sub\?\.map/);
  });

  /**
   * `if` 分支内提前 `return` + 主路径 `return row.sub?.map`：分支与主路径的 return 均需扫描到并 coalesce。
   */
  it("compileSource：rows?.map(row => { if (!row.sub) return null; return row.sub?.map(...) }) 应包 coalesce", () => {
    const source = `
function Guard() {
  const rows: { sub?: { id: number }[] }[] | undefined = [];
  return (
    <ul>
      {rows?.map((row) => {
        if (!row.sub) return null;
        return row.sub?.map((s) => <li key={s.id}>{String(s.id)}</li>);
      })}
    </ul>
  );
}
`;
    const out = compileSource(source, "IfReturnOptMap.tsx");
    const n = (out.match(/coalesceIrList/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(out).toContain("if (!row.sub)");
    expect(out).toMatch(/sub\?\.map/);
  });

  /**
   * 块内 `const renderItems = () => row.sub?.map(...)`：初值箭头体须 coalesce，与同类方案 列表内局部渲染函数一致。
   */
  it("compileSource：map 块内 const 箭头初值含 row.sub?.map 应包 coalesce", () => {
    const source = `
function LocalFn() {
  const rows: { sub?: { id: number }[] }[] | undefined = [];
  return (
    <ul>
      {rows?.map((row) => {
        const renderItems = () =>
          row.sub?.map((s) => <li key={s.id}>{String(s.id)}</li>);
        return renderItems();
      })}
    </ul>
  );
}
`;
    const out = compileSource(source, "LocalArrowInit.tsx");
    const n = (out.match(/coalesceIrList/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(out).toContain("const renderItems = ");
    expect(out).toMatch(/sub\?\.map/);
  });

  it("compileSource：{items?.map(...)} 应包 coalesceIrList 并注入 import", () => {
    const source = `
function List() {
  const items: { id: number }[] | undefined = [];
  return (
    <ul>
      {items?.map((row) => (
        <li key={row.id}>{String(row.id)}</li>
      ))}
    </ul>
  );
}
`;
    const out = compileSource(source, "OptMap.tsx");
    expect(out).toContain("coalesceIrList(");
    expect(out).toContain("items?.map");
    expect(out).toMatch(/coalesceIrList\([\s\S]*\?\.map/);
    expect(out).toMatch(
      /import\s*\{[^}]*coalesceIrList[^}]*\}\s*from\s*["']@dreamer\/view\/compiler["']/,
    );
  });

  /**
   * `items?.flatMap` 与 `?.map` 同为「列表源 + 可选链」，短路为 undefined 时须 coalesce。
   */
  it("compileSource：{items?.flatMap(...)} 应包 coalesceIrList", () => {
    const source = `
function Rows() {
  const groups: { rows: string[] }[] | undefined = [];
  return (
    <ul>
      {groups?.flatMap((g) => g.rows.map((t) => <li key={t}>{t}</li>))}
    </ul>
  );
}
`;
    const out = compileSource(source, "OptFlatMap.tsx");
    expect(out).toContain("coalesceIrList(");
    expect(out).toContain("groups?.flatMap");
    expect(out).toMatch(/coalesceIrList\([\s\S]*\?\.flatMap/);
  });

  /**
   * 链式 `items?.filter(...)?.map(...)`：最外层为 `?.map`，须 coalesce；中间 `?.filter` 与同类方案 列表写法一致。
   */
  it("compileSource：{items?.filter(...)?.map(...)} 应包 coalesceIrList", () => {
    const source = `
function Active() {
  const items: { ok: boolean; id: number }[] | undefined = [];
  return (
    <ul>
      {items?.filter((x) => x.ok)?.map((row) => (
        <li key={row.id}>{String(row.id)}</li>
      ))}
    </ul>
  );
}
`;
    const out = compileSource(source, "OptFilter.tsx");
    expect(out).toContain("coalesceIrList(");
    expect(out).toContain("items?.filter");
    expect(out).toMatch(/coalesceIrList\([\s\S]*\?\.map/);
  });

  /**
   * 仅 `items?.filter(...)` 作子表达式时，根调用为可选链 `.filter`，整体可能为 undefined，须 coalesce。
   */
  it("compileSource：{items?.filter(...)} 无后续 map 时也应包 coalesceIrList", () => {
    const source = `
function OnlyFilter() {
  const items: { ok: boolean }[] | undefined = [];
  return <ul>{items?.filter((x) => x.ok)}</ul>;
}
`;
    const out = compileSource(source, "OptFilterOnly.tsx");
    expect(out).toContain("coalesceIrList(");
    expect(out).toMatch(/coalesceIrList\([\s\S]*\?\.filter/);
  });

  it("已有 insert 的 import 时若产物含 insertReactive 应注入 insertReactive 避免 ReferenceError", () => {
    const source = `
import { createSignal, insert } from "@dreamer/view";
function Page() {
  const [x] = createSignal(0, true);
  return <p>{x()}</p>;
}
`;
    const out = compileSource(source, "runtime.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("insertReactive(");
    expect(out).toMatch(
      /import\s*\{[^}]*\binsert\b[^}]*\binsertReactive\b[^}]*\}\s*from\s*["']@dreamer\/view["']/,
    );
  });

  it("已有 insert 的 import 时若产物含 createEffect（如受控 input）应注入 createEffect", () => {
    const source = `
import { createSignal, insert } from "@dreamer/view";
function Page() {
  const [v, setV] = createSignal("", true);
  return <input type="text" value={() => v()} />;
}
`;
    const out = compileSource(source, "ctrl.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("createEffect(");
    expect(out).toMatch(
      /import\s*\{[^}]*\binsert\b[^}]*\bcreateEffect\b[^}]*\}\s*from\s*["']@dreamer\/view["']/,
    );
  });

  it("disabled 等布尔属性为无参箭头时应用 createEffect 调用 getter，避免 !!函数 恒 true 导致永久禁用", () => {
    const source = `
import { createSignal, insert } from "@dreamer/view";
function Page() {
  const loading = createSignal(false);
  return <button type="button" disabled={() => loading.value}>x</button>;
}
`;
    const out = compileSource(source, "dis.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("createEffect(");
    expect(out).toMatch(/\.disabled\s*=\s*\!\!/);
    expect(out).toContain("loading.value");
    // 须 `!!(() => …)()` 调用 getter；旧实现为 `!!(() => …)` 无尾 `()`，导致恒为 true
    expect(out).toMatch(/\(\(\)\s*=>\s*loading\.value\)\s*\(\)/);
  });

  it("编译产物为合法 TS 且含 appendChild、箭头函数", () => {
    const source =
      `function App() { return <div><span>{count()}</span></div>; }`;
    const out = compileSource(source);
    expect(out).toContain("appendChild");
    expect(out).toContain("=>");
    expect(out).toContain("__viewMountParent");
  });

  it("自定义组件子节点应编译为 (__viewMountParent)=>{…} 挂载函数，而非 createDocumentFragment", () => {
    const source = `
function Form(props: { children?: unknown }) {
  return <form className="f">{props.children}</form>;
}
function Page() {
  return (
    <div>
      <Form><span className="x">hi</span></Form>
    </div>
  );
}
`;
    const out = compileSource(source, "Page.tsx");
    expect(out).not.toContain("createDocumentFragment");
    expect(out).toMatch(/\(__viewMountParent:\s*Element\)\s*=>\s*\{/);
  });

  it('label 的 htmlFor 应编译为 setAttribute("for", …) 而非 htmlFor', () => {
    const source = `
function X() {
  return <label htmlFor="x" className="a">t</label>;
}
`;
    const out = compileSource(source, "X.tsx");
    expect(out).toContain('setAttribute("for"');
    expect(out).not.toContain('setAttribute("htmlFor"');
  });

  it('动态 target={expr} 应生成 setIntrinsicDomAttribute，避免 undefined → 字面量 "undefined"', () => {
    const source = `
function L(props: { t?: string }) {
  return <a href="/" target={props.t}>x</a>;
}
`;
    const out = compileSource(source, "L.tsx");
    expect(out).toContain("setIntrinsicDomAttribute(");
    expect(out).toMatch(/setIntrinsicDomAttribute\(\s*\w+\s*,\s*"target"/);
    expect(out).not.toMatch(
      /\.setAttribute\(\s*"target"\s*,\s*props\.t\s*\)/,
    );
  });

  it('动态 className={expr} 应生成 setIntrinsicDomAttribute("class", …)', () => {
    const source = `
function B(props: { c?: string }) {
  return <div className={props.c}>x</div>;
}
`;
    const out = compileSource(source, "B.tsx");
    expect(out).toContain("setIntrinsicDomAttribute(");
    expect(out).toMatch(/setIntrinsicDomAttribute\(\s*\w+\s*,\s*"class"/);
  });

  /**
   * 属性级细粒度：标识符 / 属性链等可订阅形态须包 `createEffect`，与 value/checked 对齐。
   */
  it("compileSource：动态 className 为 props 链时应 createEffect 内 setIntrinsicDomAttribute", () => {
    const source = `
function B(props: { c?: string }) {
  return <div className={props.c}>x</div>;
}
`;
    const out = compileSource(source, "B-effect.tsx");
    expect(out).toContain("createEffect(");
    expect(out).toContain("setIntrinsicDomAttribute(");
  });

  /**
   * 表达式级多插入点：逗号左侧无 JSX 时拆成语句 + 末段 JSX（与块内顺序一致）。
   */
  it("compileSource：子级 { side(), <span/> } 应前段语句与末段 createElement 分离", () => {
    const source = `
function App() {
  const side = () => {};
  return <div>{ side(), <span id="x">a</span> }</div>;
}
`;
    const out = compileSource(source, "CommaChild.tsx");
    expect(out).toContain("side();");
    expect(out).toContain('createElement("span"');
    expect(out).toMatch(/side\(\);\s*[\s\S]*insert\(\s*_0\s*,\s*markMountFn/);
  });

  /**
   * 半自动 createMemo：`// @view-memo` 单行 `const` 包 `createMemo`，JSX 内引用改为 `x()`。
   */
  it("compileSource：@view-memo 包 createMemo 且花括号内标识符改为调用", () => {
    const source = `
function App() {
  const n = 2;
  // @view-memo
  const doubled = n * 2;
  return <div>{doubled}</div>;
}
`;
    const out = compileSource(source, "ViewMemo.tsx");
    expect(out).toContain("createMemo(");
    expect(out).toContain("doubled()");
  });

  it("组件返回 ()=>子树（外层零参）时须 insertReactive(parent, ()=>_result())，不得 _result(parent) 丢 VNode", () => {
    const source = `
function Form(props: { children?: unknown }) {
  return () => (
    <form className="f">{props.children}</form>
  );
}
function Page() {
  return (
    <div>
      <Form><span>t</span></Form>
    </div>
  );
}
`;
    const out = compileSource(source, "Page.tsx");
    expect(out).toContain("isMountFn(_2)");
    expect(out).toMatch(
      /insertReactive\(\s*\w+\s*,\s*\(\)\s*=>\s*\w+\(\)\s*\)/,
    );
  });

  /**
   * 回归：块内 const 初值含 JSX（如 label 条件渲染）+ 末尾 return 根节点时，不得把
   * `return () => { ... }` 整段误判为「非单根 JSX」而包成 `(parent)=>insertReactive(parent,…)`，
   * 否则产物为未打标单参函数，子树 insertReactive 认不出 MountFn，表单类示例整片空白。
   */
  it("块内 const 初值含 JSX 时组件仍应 return () => { … } 而非 (parent)=>insertReactive 外包", () => {
    const source = `
export function FormItemLike(props: { label?: string; children?: unknown }) {
  return () => {
    const labelEl = props.label != null ? (
      <label className="lb">{props.label}</label>
    ) : null;
    return (
      <div className="wrap">
        {labelEl}
        <div className="inner">{props.children}</div>
      </div>
    );
  };
}
`;
    const out = compileSource(source, "FormItemLike.tsx");
    expect(out).toMatch(/return\s*\(\)\s*=>\s*\{/);
    expect(out).not.toMatch(
      /return\s*\(\s*parent\s*:\s*Element\s*\)\s*=>\s*\{[^}]*insertReactive\s*\(\s*parent/,
    );
    expect(out).toContain("markMountFn");
  });

  /**
   * 回归：列表 `.map` 内 `(item) => 三元 + JSX` 只能展开为 `item ? markMountFn : markMountFn`，
   * 不得被 compileSource 误判为「根级表达式体 JSX」而包成 `(item)=>(parent)=>insertReactive(…)`，
   * 否则 insertReactive 数组分支跳过未打标 MountFn，工具栏等子树不挂载。
   */
  it("map 回调带参且表达式体为三元 JSX 时应直接返回 markMountFn 分支而非外包 insertReactive", () => {
    const source = `
function X() {
  const items = [1, 2];
  return () => (
    <div>
      {items.map((item) =>
        item ? <span>a</span> : <span>b</span>
      )}
    </div>
  );
}
`;
    const out = compileSource(source, "map-ternary.tsx");
    expect(out).toMatch(/items\.map\(\(item\)\s*=>\s*item\s*\?/);
    expect(out).not.toContain(
      "items.map((item) => (parent: Element) =>",
    );
    expect(out).toContain("markMountFn");
  });

  it("组件 <Comp /> 应编译为运行一次 + insert(getter 或 () => value)", () => {
    const source = `
function App() {
  return <Comp a={1} b={x()} />;
}
`;
    const out = compileSource(source);
    expect(out).toContain("insert");
    expect(out).toContain("typeof");
    expect(out).toContain("function");
    expect(out).toContain("Comp");
    expect(out).toMatch(/Comp\s*\(/);
  });

  it("return ( <Comp /> ) 括号包裹的 JSX 应被识别并编译", () => {
    const source = `
function App() {
  return (
    <RoutePage match={m} router={r} />
  );
}
`;
    const out = compileSource(source);
    expect(out).not.toContain("<RoutePage"); // 不应保留原始 JSX
    expect(out).toContain("RoutePage");
    expect(out).toMatch(/RoutePage\s*\(/);
    expect(out).toContain("__viewMountParent");
  });

  /**
   * 未打标 `(parent)=>void`（如 RoutePage）须 `result(parent)`；仅 `isMountFn` 时会误走
   * `insertReactive(() => result())` 导致 parent 为 undefined。
   */
  it("组件返回未打标单参挂载函数时应 isMountFn||单参+!isSignalGetter 分支并 __viewMountParent 调用", () => {
    const source = `
function Shell() {
  return (parent: Element) => {
    parent.appendChild(document.createTextNode("ok"));
  };
}
function App() {
  return (
    <div>
      <Shell />
    </div>
  );
}
`;
    const out = compileSource(source, "shell.tsx");
    expect(out).toContain("isSignalGetter");
    expect(out).toMatch(
      /isMountFn\(\w+\)\s*\|\|\s*\(\s*typeof\s+\w+\s*===\s*["']function["']\s*&&\s*\w+\.length\s*===\s*1\s*&&\s*!isSignalGetter\(\w+\)\)/,
    );
    /** 首分支须直接以单参调用挂载函数（父为内层 div 临时变量，非根 `__viewMountParent`） */
    expect(out).toMatch(
      /\)\)\)\)\s*\n\s*\w+\(\w+\)\s*;\s*\n\s*else if \(typeof \w+ === "function"\)/,
    );
  });

  it("箭头函数表达式体为 JSX 时应编译为 mount 函数（如 SunIcon = () => ( <svg/> )）", () => {
    const source = `
const SunIcon = () => (
  <svg className="h-5 w-5" aria-hidden="true"><path d="M0 0"/></svg>
);
`;
    const out = compileSource(source);
    expect(out).not.toContain("<svg"); // 不应保留原始 JSX
    expect(out).toContain("__viewMountParent");
    expect(out).toContain("createElement");
  });

  it("JsxExpression 内三元/组件如 { isDark ? <SunIcon /> : <MoonIcon /> } 应转为组件调用无原始 JSX", () => {
    const source = `
function App() {
  return <div>{isDark ? <SunIcon /> : <MoonIcon />}</div>;
}
`;
    const out = compileSource(source);
    expect(out).not.toContain("<SunIcon"); // 不应保留原始 JSX
    expect(out).not.toContain("<MoonIcon");
    expect(out).toContain("SunIcon");
    expect(out).toContain("MoonIcon");
    // 表达式内组件现走完整 jsxToRuntimeFunction，三元各支为 (parent)=>{...}，允许换行
    expect(out).toMatch(/isDark\s*\?[\s\S]*SunIcon[\s\S]*:[\s\S]*MoonIcon/);
  });

  it("嵌套函数内 return JSX（如 .map 回调）应被转为 return MountFn，以便 insertReactive 收到 MountFn 数组", () => {
    const source = `
function List() {
  return (
    <div>
      {items.map((x) => {
        return <span key={x}>{x}</span>;
      })}
    </div>
  );
}
`;
    const out = compileSource(source);
    expect(out).not.toContain("return <span"); // 嵌套 return <span> 应被替换为 return (__viewMountParent)=>...
    expect(out).toContain("__viewMountParent");
    expect(out).toContain("items.map");
  });

  /**
   * Table tbody：`displayData.flatMap` 块内 `const rows = [<tr/>]`、`if (...) rows.push(<tr/>)` 曾漏转，
   * hybrid compile 会残留 JSX。须与外层一致展开为 `createElement` / 挂载函数。
   */
  it("flatMap 回调块内数组字面量与 push 中的 JSX 应完整编译，无 <tr>/<td> 残留", () => {
    const source = `
function TableBody() {
  return (
    <tbody>
      {data.flatMap((row, index) => {
        const key = String(row);
        const rows: unknown[] = [
          <tr key={key}>
            <td>{row}</td>
          </tr>,
        ];
        if (index === 0) {
          rows.push(<tr key={key + "-exp"}><td colSpan={2}>extra</td></tr>);
        }
        return rows;
      })}
    </tbody>
  );
}
`;
    const out = compileSource(source, "TableBody.tsx");
    expect(out).not.toContain("<tr");
    expect(out).not.toContain("<td");
    expect(out).toContain('createElement("tr")');
    expect(out).toContain('createElement("td")');
    expect(out).toContain("data.flatMap");
  });

  /**
   * compileSource 会先改写对象内「单参箭头 + JSX」；对象字面量若再无有效 source pos，
   * buildJsxAttributesMergeSegments 曾误判为空并把整段 prop 打成 undefined（如 Table 的 expandable）。
   */
  it("含 JSX 的对象 props 在 compileSource 预 visit 后仍须保留，不可将 expandable 编成 undefined", () => {
    const source = `
function Table(props: Record<string, unknown>) {
  return <div />;
}
function Page() {
  return (
    <Table
      columns={[]}
      dataSource={[]}
      expandable={{
        onExpand: (_e: boolean, _r: unknown) => {},
        expandedRowRender: (record: unknown) => <p>{String(record)}</p>,
      }}
    />
  );
}
`;
    const out = compileSource(source, "Page.tsx");
    expect(out).not.toContain("expandable: undefined");
    expect(out).toContain("expandedRowRender");
    expect(out).toContain("onExpand");
  });

  it("Suspense 子 slot 应编译为无参 getter 并作为 children 传入，组件返回单参 MountFn 时直接调用", () => {
    const source = `
function Demo() {
  return (
    <section>
      <Suspense fallback={<p>wait</p>}>
        {signal()}
      </Suspense>
    </section>
  );
}
`;
    const out = compileSource(source, "Demo.tsx");
    expect(out).toContain("Suspense");
    expect(out).toMatch(/const\s+\w+\s*=\s*\(\)\s*=>\s*signal\(\)/);
    expect(out).toMatch(/children:\s*\w+/);
    expect(out).toMatch(/typeof\s+_\d+\s*===\s*["']function["']/);
  });

  it("Suspense slot 为 Promise 链且 .then 内为 JSX 时，children getter 须保留 fakeApi/then/catch（不可编成 () => undefined）", () => {
    const source = `
function fakeApi(id: number): Promise<{ name: string }> {
  return Promise.resolve({ name: "x" });
}
function Demo() {
  return (
    <div>
      <Suspense fallback={<p>wait</p>}>
        {fakeApi(99)
          .then((d) => <span>{d.name}</span>)
          .catch(() => <span>e</span>)}
      </Suspense>
    </div>
  );
}
`;
    const out = compileSource(source, "Demo.tsx");
    expect(out).toContain("fakeApi(99)");
    expect(out).toContain(".then(");
    expect(out).not.toMatch(/children:\s*\w+[\s\S]*\(\)\s*=>\s*undefined/);
  });

  /** 子 getter 内返回多节点时编译器应生成 insertReactive（实现中常含数组迭代） */
  it("子 getter 返回多子节点时应编译为 insertReactive", () => {
    const source = `
function ListView() {
  return (
    <ul>
      {() => items().map((item: unknown, i: number) => (
        <li key={i}>{String(item)}</li>
      ))}
    </ul>
  );
}
`;
    const out = compileSource(source, "ListView.tsx");
    expect(out).toContain(".map(");
    expect(out).toContain("insertReactive");
  });

  it("内置元素 vIf + vElseIf + vElse 兄弟链应编译为嵌套 if / else", () => {
    const source = `
function App() {
  return (
    <>
      <p vIf={() => tab() === "a"}>A</p>
      <p vElseIf={() => tab() === "b"}>B</p>
      <p vElse>C</p>
    </>
  );
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toMatch(/if\s*\(/);
    expect(out).not.toContain("vElse");
    expect(out).not.toContain("vElseIf");
    expect(out).not.toContain("vIf");
  });

  /**
   * 并列多个 vIf（非 vElseIf）：解析为多条单分支链；每条 insertReactive 的 getter 内必须带条件，
   * 不得无条件 `return mount`，否则三个分支会同时挂载。
   */
  it("内置元素并列多个 vIf 时每条 insertReactive getter 内应含条件 if", () => {
    const source = `
function App() {
  const n = 2;
  return (
    <div>
      <span vIf={() => n === 1}>1</span>
      <span vIf={() => n === 2}>2</span>
      <span vIf={() => n === 3}>3</span>
    </div>
  );
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("insertReactive");
    /** 箭头条件会编成 `if ((() => n === k)())`；须含各分支比较且不得落未编译 vIf */
    expect(out).toMatch(/n\s*===\s*1/);
    expect(out).toMatch(/n\s*===\s*2/);
    expect(out).toMatch(/n\s*===\s*3/);
    expect(out).not.toContain("vIf");
  });

  /**
   * 单分支 v-if：编译器须在 false 时显式 `else return` 空 `(parent) => {}`，与手写 vElse 空支一致，
   * 使 insertReactive 始终走 MountFn 分支并 detach 上一帧（见 transform buildNoOpIfFalseMountArrow）。
   */
  it("内置元素仅 vIf 无 vElse 时 insertReactive getter 应含 else return 空挂载", () => {
    const source = `
function App() {
  return (
    <div>
      <p vIf={() => show()}>hi</p>
    </div>
  );
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("insertReactive");
    expect(out).toMatch(/else/);
    expect(out).not.toContain("vIf");
  });

  /**
   * 回归：根 return 直接 `<div vIf>` 曾编成 mount 内单次 `if (cond){...}`，signal 变 false 不卸 DOM；
   * 用 `<>...</>` 包一层时子节点走兄弟链 insertReactive 故「只有包 Fragment 才正常」。修复后根节点与 Fragment 一致。
   */
  it("根节点单层内置元素 vIf 应编译为 insertReactive（勿用单次 mount 内 if）", () => {
    const source = `
function Modal() {
  return (
    <div vIf={() => show()}>
      hi
    </div>
  );
}
`;
    const out = compileSource(source, "Modal.tsx");
    expect(out).toContain("insertReactive");
    expect(out).toMatch(/else/);
    expect(out).not.toContain("vIf");
  });

  it("vOnce 动态子项应使用 createEffect 实现首次渲染+最多再更新一次，且不落 vOnce 属性", () => {
    const source = `
function App() {
  return (
    <div vOnce>
      {String(count())}
    </div>
  );
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("createEffect");
    expect(out).toContain("createTextNode");
    expect(out).toContain("appendChild");
    expect(out).not.toContain("vOnce");
  });

  it("vCloak 应生成 setAttribute data-view-cloak 且不落 vCloak 属性", () => {
    const source = `
function App() {
  return <p vCloak>hi</p>;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("data-view-cloak");
    expect(out).not.toContain("vCloak");
  });

  it("根 return 含 JSX 三元时应包成 insertReactive 根挂载，且无未编译 JSX", () => {
    const source = `
function App() {
  return ok ? <div className="a" /> : <span className="b" />;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).not.toMatch(/return\s+ok\s*\?\s*</);
    expect(out).toContain("insertReactive");
    expect(out).toContain("createElement");
    expect(out).toContain('"div"');
    expect(out).toContain('"span"');
  });

  /**
   * 根 return：条件在编译期可证时折叠为单根 JSX，应直接 markMountFn，勿外包 insertReactive(parent, …)。
   */
  it("根 return 常量三元折叠后应 markMountFn 而非 insertReactive(parent", () => {
    const source = `
function App() {
  return true ? <div className="picked" /> : <span className="other" />;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("markMountFn");
    expect(out).not.toMatch(/insertReactive\s*\(\s*parent\s*,/);
    expect(out).toContain('"div"');
    expect(out).not.toMatch(/return\s+true\s*\?\s*</);
  });

  it("零参箭头表达式体常量三元折叠后应 markMountFn 而非 insertReactive(parent", () => {
    const source = `
function App() {
  return () => false ? <div /> : <span className="from-false" />;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("markMountFn");
    expect(out).not.toMatch(/insertReactive\s*\(\s*parent\s*,/);
    expect(out).toContain('"span"');
  });

  /**
   * 块体仅一条 `return expr` 时先折叠为表达式体，再参与常量三元 deepFold，应与 `() => expr` 同路径。
   */
  it("零参箭头块体单 return 常量三元折叠后应 markMountFn 而非 insertReactive(parent", () => {
    const source = `
function App() {
  return () => {
    return true ? <div className="picked" /> : <span className="other" />;
  };
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("markMountFn");
    expect(out).not.toMatch(/insertReactive\s*\(\s*parent\s*,/);
    expect(out).toContain('"div"');
  });

  it("零参箭头块体含多条语句时不应误折叠（变量三元仍 insertReactive）", () => {
    const source = `
function App() {
  return () => {
    const x = 1;
    return ok ? <div className="a" /> : <span className="b" />;
  };
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("insertReactive");
    expect(out).toContain("createElement");
    expect(out).toContain('"div"');
    expect(out).toContain('"span"');
  });

  /**
   * 前导仅为 ExpressionStatement、末条 return 时折叠为逗号表达式体，尾部常量三元仍 markMountFn。
   */
  it("零参箭头块体 expressionStmt + return 常量三元应 markMountFn 而非 insertReactive(parent", () => {
    const source = `
function App() {
  return () => {
    void 0;
    return true ? <div className="picked" /> : <span className="other" />;
  };
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("markMountFn");
    expect(out).not.toMatch(/insertReactive\s*\(\s*parent\s*,/);
    expect(out).toContain('"div"');
  });

  /**
   * 首条为裸字符串字面量语句时不应改为逗号体，以免丧失指令前导语义（如 use strict）。
   */
  it("零参箭头块体首条为字符串字面量时不应折叠为逗号表达式体", () => {
    const source = `
function App() {
  return () => {
    "use strict";
    return true ? <div className="picked" /> : <span className="other" />;
  };
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toMatch(/return\s*\(\)\s*=>\s*\{/);
    expect(out).toContain("markMountFn");
    expect(out).toContain('"div"');
  });

  it("内置标签 {...attrs} 应生成 spreadIntrinsicProps 并注入对应 import", () => {
    const source = `
function App() {
  return <div {...rest} id="x" />;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("spreadIntrinsicProps");
    expect(out).toMatch(/import\s*\{[^}]*spreadIntrinsicProps[^}]*\}\s*from/);
  });

  it("组件 {...props} 应生成 mergeProps 链并注入 mergeProps import", () => {
    const source = `
function App() {
  return <Box {...a} title="t" />;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("mergeProps");
    expect(out).toMatch(/import\s*\{[^}]*mergeProps[^}]*\}\s*from/);
    expect(out).toContain("Box");
  });

  it("组件 vIf / vElseIf / vElse 兄弟链应编译为嵌套 if（不要求内置标签）", () => {
    const source = `
function App() {
  return (
    <>
      <Panel vIf={() => tab() === 1} />
      <Panel vElseIf={() => tab() === 2} />
      <Panel vElse />
    </>
  );
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toMatch(/if\s*\(/);
    expect(out).not.toContain("vElseIf");
    expect(out).not.toContain("vIf");
    expect(out).toContain("Panel");
  });

  it("内置元素 vFocus 等自定义指令应生成 applyDirectives 调用并注入 directive 导入（含 registerDirectiveUnmount）", () => {
    const source = `
function App() {
  return <input type="text" vFocus placeholder="获得焦点" />;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("applyDirectives(");
    expect(out).toContain("registerDirectiveUnmount");
    expect(out).toContain("@dreamer/view/directive");
    expect(out).toContain("applyDirectives, registerDirectiveUnmount");
    expect(out).not.toMatch(/setAttribute\s*\(\s*["']vFocus["']/);
  });

  it("内置元素 ref={函数} 应生成 scheduleFunctionRef 并注入 runtime 导入", () => {
    const source = `
function App() {
  let el = null;
  return <input ref={(n) => { el = n; }} />;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("scheduleFunctionRef(");
    expect(out).toMatch(/import\s*\{[^}]*scheduleFunctionRef[^}]*\}\s*from/);
  });

  it("内置元素 ref={createRef()} 应经 scheduleFunctionRef 写 ref.current，离屏挂载时也能赋值", () => {
    const source = `
function App() {
  const wrapRef = createRef();
  return <div ref={wrapRef} />;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("scheduleFunctionRef(");
    expect(out).toContain(".current");
  });

  it("input value={SignalRef} 应编译为 createEffect 写 el.value，并用 unwrapSignalGetterValue 解包避免 [object Object]", () => {
    const source = `
function App() {
  const text = createSignal("");
  return <input value={text} />;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("createEffect");
    expect(out).toContain(".value");
    expect(out).toContain("unwrapSignalGetterValue(text)");
    // 不应出现 setAttribute("value", text)，否则 input 会显示函数字符串
    expect(out).not.toMatch(/setAttribute\s*\(\s*[^,]*,\s*text\s*\)/);
  });

  /**
   * 逗号运算符右侧为 JSX 时，若 transform 仅处理 &&/||/??，会漏转整棵表达式。
   */
  it("子表达式中逗号运算符右侧含标签时应展开为 createElement", () => {
    const source = `
function App() {
  return <div>{(0, <span className="x">comma</span>)}</div>;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("createElement");
    expect(out).toContain('"span"');
    expect(out).not.toMatch(/<\s*span\b/);
  });

  /**
   * 一元运算包裹的逻辑与内若含 JSX，须递归 operand，否则产物仍含未编译的 <span。
   */
  it("已有多行 import 且末项带尾随逗号时注入 unwrap 不得产生 ,, 语法错误", () => {
    const source = `
import {
  createSignal,
  insert,
} from "@dreamer/view/runtime";
function App() {
  const [x] = createSignal(0, true);
  return <span>{x}</span>;
}
`;
    const out = compileSource(source, "App.tsx", {
      insertImportPath: "@dreamer/view/compiler",
    });
    expect(out).not.toMatch(/,\s*,\s*unwrapSignalGetterValue/);
    expect(out).toContain("unwrapSignalGetterValue");
  });

  it("文本插值裸 signal 标识符应生成 unwrapSignalGetterValue 并出现在 runtime import 中", () => {
    const source = `
function App() {
  const [c, setC] = createSignal(0, true);
  return <span>{c}</span>;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("unwrapSignalGetterValue(c)");
    expect(out).toMatch(
      /import\s*\{[^}]*unwrapSignalGetterValue[^}]*\}\s*from\s*["']@dreamer\/view\/compiler["']/,
    );
  });

  it("子表达式中一元运算包裹的 && 内标签应展开", () => {
    const source = `
function App() {
  return <div>{!(false && <span className="u">u</span>)}</div>;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("createElement");
    expect(out).toContain('"span"');
    expect(out).not.toMatch(/<\s*span\b/);
  });

  it("自定义组件 vSlotGetter：children 为无参 getter，且指令属性不进入 mergeProps", () => {
    const source = `
import { insert } from "@dreamer/view";
function MyBoundary(props: unknown): unknown {
  return null;
}
function App() {
  return (
    <MyBoundary vSlotGetter fallback={null}>
      <span>slot</span>
    </MyBoundary>
  );
}
`;
    const out = compileSource(source, "v-slot-getter.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain("MyBoundary(");
    expect(out).not.toContain("vSlotGetter");
    expect(out).toMatch(/const _\d+ = \(\) =>/);
  });

  /**
   * `return () => ( <JSX/> )`：内层箭头经 compileSource 变为 `() => MountFn`；外层仍返回零参 getter。
   * 若 vnode-mount 把内层 MountFn `String()` 化，文档站等会出现整页函数源码（regression 与 mount 测试配套）。
   */
  /**
   * 步骤 4（MVP）：`{<span/>}` 等纯静态本征 JSX 子表达式应 `insert(parent, markMountFn(...))`，
   * 避免包一层 `insertReactive` 多挂一个 effect。
   */
  it("compileSource：纯静态本征 JSX 子表达式应 insert 挂载而非 insertReactive", () => {
    const source = `
function App() {
  return <div>{<span className="s">a</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).not.toMatch(
      /insertReactive\(\s*_0\s*,\s*\(\)\s*=>\s*markMountFn/,
    );
  });

  /**
   * 步骤 4（MVP）：花括号内字面量字符串走 `insert`，不经 insertReactive。
   */
  it("compileSource：静态字符串子表达式应 insert 而非 insertReactive", () => {
    const source = `function App() { return <p>{"hi"}</p>; }`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*"hi"\s*\)/);
    expect(out).not.toMatch(/insertReactive\(\s*_0\s*,\s*\(\)\s*=>\s*"hi"/);
  });

  /**
   * 步骤 4 扩展：编译期常量短路 `true && <span/>` 折叠为单侧静态 JSX，应 `insert`+`markMountFn`，
   * 避免 `insert(true&&fn)` 被运行时当成零参 getter 走 insertReactive。
   */
  it("compileSource：true && 静态 JSX 应折叠后 insert 而非 insertReactive", () => {
    const source = `
function App() {
  return <div>{true && <span>x</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).not.toMatch(
      /insertReactive\(\s*_0\s*,\s*\(\)\s*=>\s*true\s*&&\s*markMountFn/,
    );
  });

  it("compileSource：false || 静态 JSX 应折叠后 insert", () => {
    const source = `
function App() {
  return <div>{false || <span>y</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).not.toContain("insertReactive(_0");
  });

  it("compileSource：null ?? 静态 JSX 应折叠后 insert", () => {
    const source = `
function App() {
  return <div>{null ?? <span>z</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).not.toContain("insertReactive(_0");
  });

  it("compileSource：void 0 ?? 静态 JSX 应折叠后 insert（void 视为 nullish）", () => {
    const source = `
function App() {
  return <div>{void 0 ?? <span>voidish</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).not.toContain("insertReactive(_0");
  });

  /**
   * 步骤 4：`??` 左侧编译期必非 nullish 时结果为左值，右侧 JSX 为死代码，应剔除以免多余 effect。
   */
  it("compileSource：1 ?? 静态 JSX 应折叠后仅保留左值 insert", () => {
    const source = `
function App() {
  return <div>{1 ?? <span className="dead-branch">nope</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).not.toContain("dead-branch");
    expect(out).not.toContain("insertReactive(_0");
  });

  /**
   * 步骤 4 扩展：编译期 `===` 字面量求值后常量三元折叠为单侧 JSX，应 `insert`+`markMountFn`。
   */
  it("compileSource：1 === 1 ? 静态 JSX 应折叠后 insert", () => {
    const source = `
function App() {
  return <div>{1 === 1 ? <span className="eq-true">y</span> : <span className="eq-false">n</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).not.toContain("insertReactive(_0");
    expect(out).toContain('"eq-true"');
    expect(out).not.toContain('"eq-false"');
  });

  /**
   * `!==` 为假时选三元 false 支，死分支不进入产物。
   */
  it("compileSource：2 !== 2 ? JSX 应折叠为 false 支 insert", () => {
    const source = `
function App() {
  return <div>{2 !== 2 ? <span className="bad" /> : <span className="neq-false-branch">ok</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"neq-false-branch"');
    expect(out).not.toContain('"bad"');
  });

  /**
   * 根 return：条件为可求值 `===` 假时与 `true ?` 同路径，直接 markMountFn。
   */
  it("根 return 编译期 === 假时三元折叠后应 markMountFn 选中支", () => {
    const source = `
function App() {
  return 1 === 2 ? <div className="no" /> : <div className="yes" />;
}
`;
    const out = compileSource(source, "App.tsx");
    expect(out).toContain("markMountFn");
    expect(out).not.toMatch(/insertReactive\s*\(\s*parent\s*,/);
    expect(out).toContain('"yes"');
    expect(out).not.toContain('"no"');
  });

  /**
   * `typeof` 作用于可静态字面量时，`===` 可与同类方案 一样在编译期定值并折叠三元。
   */
  it('compileSource：typeof 数字字面量 === "number" 时三元应折叠 insert', () => {
    const source = `
function App() {
  return <div>{typeof 1 === "number" ? <span className="typeof-ok">n</span> : <span className="typeof-bad">x</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"typeof-ok"');
    expect(out).not.toContain('"typeof-bad"');
  });

  it('compileSource："object" === typeof null 时应选 true 支 insert', () => {
    const source = `
function App() {
  return <div>{"object" === typeof null ? <span className="null-type">y</span> : <span className="no">n</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"null-type"');
    expect(out).not.toContain('"no"');
  });

  it('compileSource：typeof true !== "number" 时应折叠为 true 支（!== 为真）', () => {
    const source = `
function App() {
  return <div>{typeof true !== "number" ? <span className="neq-ok">ok</span> : <span className="neq-bad">bad</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"neq-ok"');
    expect(out).not.toContain('"neq-bad"');
  });

  /**
   * TS 常见 `x == null`：仅在与 null / undefined / void 0 比较时做编译期求值，不向 `1 == true` 推广。
   */
  it("compileSource：0 == null ? JSX 应取 false 支 insert", () => {
    const source = `
function App() {
  return <div>{0 == null ? <span className="bad">a</span> : <span className="non-nullish">b</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"non-nullish"');
    expect(out).not.toContain('"bad"');
  });

  it("compileSource：0 != null ? JSX 应取 true 支 insert", () => {
    const source = `
function App() {
  return <div>{0 != null ? <span className="ok">y</span> : <span className="bad">n</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"ok"');
    expect(out).not.toContain('"bad"');
  });

  it("compileSource：undefined == null 时应选 true 支 insert", () => {
    const source = `
function App() {
  return <div>{undefined == null ? <span className="undef-null">y</span> : <span className="no">n</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"undef-null"');
    expect(out).not.toContain('"no"');
  });

  it("compileSource：void 0 == null 时应选 true 支 insert", () => {
    const source = `
function App() {
  return <div>{void 0 == null ? <span className="void-eq">y</span> : <span className="no">n</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"void-eq"');
    expect(out).not.toContain('"no"');
  });

  /**
   * 纯数字字面量算术与 `===` 编译期求值（向常见批处理语义 死分支折叠）。
   */
  it("compileSource：1 + 1 === 2 ? JSX 应折叠为 true 支 insert", () => {
    const source = `
function App() {
  return <div>{1 + 1 === 2 ? <span className="arith-ok">ok</span> : <span className="arith-bad">no</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"arith-ok"');
    expect(out).not.toContain('"arith-bad"');
  });

  it("compileSource：2 * 3 === 7 ? JSX 应折叠为 false 支 insert", () => {
    const source = `
function App() {
  return <div>{2 * 3 === 7 ? <span className="bad">no</span> : <span className="arith-false">six</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"arith-false"');
    expect(out).not.toContain('"bad"');
  });

  it("compileSource：(1 + 1) && 静态 JSX 应折叠后 insert", () => {
    const source = `
function App() {
  return <div>{(1 + 1) && <span className="and-arith">two</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"and-arith"');
    expect(out).not.toContain("insertReactive(_0");
  });

  it("compileSource：(1 - 1) || 静态 JSX 应折叠后 insert", () => {
    const source = `
function App() {
  return <div>{(1 - 1) || <span className="or-zero">z</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"or-zero"');
    expect(out).not.toContain("insertReactive(_0");
  });

  /**
   * 字符串字面量仅 `+` 拼接后与 `===` 比较（向常见批处理语义 常量折叠）。
   */
  it('compileSource："a" + "b" === "ab" ? JSX 应折叠为 true 支 insert', () => {
    const source = `
function App() {
  return <div>{"a" + "b" === "ab" ? <span className="cat">ok</span> : <span className="bad">no</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"cat"');
    expect(out).not.toContain('"bad"');
  });

  it("compileSource：1 < 2 ? JSX 应折叠为 true 支 insert", () => {
    const source = `
function App() {
  return <div>{1 < 2 ? <span className="lt-ok">y</span> : <span className="lt-bad">n</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"lt-ok"');
    expect(out).not.toContain('"lt-bad"');
  });

  it("compileSource：3 <= 2 ? JSX 应折叠为 false 支 insert", () => {
    const source = `
function App() {
  return <div>{3 <= 2 ? <span className="le-bad">n</span> : <span className="le-ok">y</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"le-ok"');
    expect(out).not.toContain('"le-bad"');
  });

  it('compileSource：("" + "") || 静态 JSX 应折叠后 insert', () => {
    const source = `
function App() {
  return <div>{("" + "") || <span className="empty-cat">e</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).toContain('"empty-cat"');
    expect(out).not.toContain("insertReactive(_0");
  });

  it("compileSource：0n || 静态 JSX 应折叠后 insert", () => {
    const source = `
function App() {
  return <div>{0n || <span>bigint-falsy</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).not.toContain("insertReactive(_0");
  });

  it("compileSource：1n && 静态 JSX 应折叠后 insert", () => {
    const source = `
function App() {
  return <div>{1n && <span>bigint-truthy</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).not.toContain("insertReactive(_0");
  });

  /**
   * 常量三元：条件可证真/假且条件无 JSX 时折叠为单分支，走 insert（死分支剔除）。
   */
  it("compileSource：true ? 静态 JSX : 静态 JSX 应折叠后 insert", () => {
    const source = `
function App() {
  return <div>{true ? <span>a</span> : <span>b</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).not.toContain("insertReactive(_0");
  });

  it("compileSource：false ? 静态 JSX : 静态 JSX 应取 false 支并 insert", () => {
    const source = `
function App() {
  return <div>{false ? <span>a</span> : <span>c</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toMatch(/insert\(\s*_0\s*,\s*markMountFn\(/);
    expect(out).not.toContain("insertReactive(_0");
  });

  /**
   * 条件含变量时不得折叠三元，仍须 insertReactive。
   */
  it("compileSource：变量 ? JSX : JSX 仍应 insertReactive", () => {
    const source = `
function App() {
  const show = true;
  return <div>{show ? <span>a</span> : <span>b</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toContain("insertReactive(_0");
  });

  /**
   * 左侧非编译期常量时不得折叠，仍须 insertReactive。
   */
  it("compileSource：标识符 && JSX 仍应 insertReactive", () => {
    const source = `
function App() {
  const show = true;
  return <div>{show && <span>x</span>}</div>;
}
`;
    const out = compileSource(source);
    expect(out).toContain("insertReactive(_0");
  });

  it("return () => (JSX) 应编译掉内层 JSX，并产出单参挂载箭头（__viewMountParent）", () => {
    const source = `
function Page() {
  return () => (
    <div id="root">ok</div>
  );
}
`;
    const out = compileSource(source, "Page.tsx");
    expect(out).toContain("createElement");
    expect(out).toContain('"div"');
    expect(out).not.toMatch(/<\s*div\b/);
    expect(out).toContain("__viewMountParent");
  });
});

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

  it("compileSource 应注入 insert 与 insertReactive 的 import 若不存在", () => {
    const source = `function App() { return <span>hi</span>; }`;
    const out = compileSource(source);
    expect(out).toContain(
      'import { insert, insertReactive, getActiveDocument } from "@dreamer/view/compiler"',
    );
    expect(out).toContain("createElement");
  });

  it("已有 insert 的 import 时若产物含 insertReactive 应注入 insertReactive 避免 ReferenceError", () => {
    const source = `
import { createSignal, insert } from "@dreamer/view";
function Page() {
  const [x] = createSignal(0);
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
  const [v, setV] = createSignal("");
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
    expect(out).toMatch(/\b\w+\.length\s*===\s*1\b/);
    expect(out).toMatch(
      /insertReactive\(\s*\w+\s*,\s*\(\)\s*=>\s*\w+\(\)\s*\)/,
    );
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
  const [x] = createSignal(0);
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
  const [c, setC] = createSignal(0);
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
});

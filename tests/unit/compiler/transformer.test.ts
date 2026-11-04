import { describe, expect, it } from "@dreamer/test";
import { compileSource } from "@dreamer/view/compiler";

describe("compiler/transformer", () => {
  it("compileSource：DOM 模式首行 import 与 transformer 产出一致（含 setProperty；三元 JSX 时含 memo）", () => {
    const simple = compileSource(`export const App = () => <div />;`, "t.tsx");
    const headSimple = simple.split("\n")[0];
    expect(headSimple).toContain("setProperty");
    expect(headSimple).not.toContain("memo");

    const withMemo = compileSource(
      `export const App = () => <div>{c ? <span>a</span> : <span>b</span>}</div>;`,
      "t.tsx",
    );
    const headMemo = withMemo.split("\n")[0];
    expect(headMemo).toContain("memo");
    expect(headMemo).toContain("setProperty");
  });

  it("基础 JSX 转换：应当转换为 template() 和 insert()", () => {
    const code = `export const App = () => <div>{count()}</div>;`;
    const out = compileSource(code, "test.tsx");

    expect(out).toContain('template("<div><!--[--><!--]--></div>")');
    // walk 路径提升为模块级常量，避免每次 clone 分配数组
    expect(out).toMatch(/const _path\$\d+ = \[1\]/);
    expect(out).toMatch(/insert\(walk\(_el, _path\$\d+\)/);
    expect(out).toContain("return _el");
  });

  it("优化：walk 路径数组应模块级提升且多动态位点复用同路径常量", () => {
    const code =
      `export const App = () => <div title={a()} class={b()}>{c()}</div>;`;
    const out = compileSource(code, "test.tsx");
    // 属性在根上 path=[] 用 _el；子节点 path=[1] 提升一次
    expect(out).toMatch(/_path\$/);
    const pathDecls = out.match(/const _path\$\d+ = \[[^\]]*\]/g) ?? [];
    expect(pathDecls.length).toBeGreaterThanOrEqual(1);
    // 不应在 clone 闭包内再写字面量数组 walk(_el, [1])
    expect(out).not.toMatch(/walk\(_el, \[\d/);
  });

  it("嵌套组件转换：应当转换为函数调用", () => {
    const code =
      `export const App = () => <Show when={ok()}><span>Showed</span></Show>;`;
    const out = compileSource(code, "test.tsx");

    expect(out).toContain("Show({");
    expect(out).toContain("when: () => ok()");
    expect(out).toContain('template("<span>Showed</span>")');
  });

  it("优化：组件静态/非响应式 props 不包箭头函数", () => {
    const staticWhen = compileSource(
      `export const App = () => <Show when={true}><span>x</span></Show>;`,
      "t.tsx",
    );
    expect(staticWhen).toContain("Show({");
    expect(staticWhen).toContain("when: true");
    expect(staticWhen).not.toContain("when: () => true");

    const idWhen = compileSource(
      `export const App = () => <Show when={flag}><span>x</span></Show>;`,
      "t.tsx",
    );
    expect(idWhen).toContain("when: flag");
    expect(idWhen).not.toContain("when: () => flag");

    const reactive = compileSource(
      `export const App = () => <Show when={ok()}><span>x</span></Show>;`,
      "t.tsx",
    );
    expect(reactive).toContain("when: () => ok()");
  });

  it("属性绑定：应当使用 setAttribute", () => {
    const code = `export const App = () => <div class={color()}></div>;`;
    const out = compileSource(code, "test.tsx");

    expect(out).toContain('setAttribute(_el, "class", () => color())');
  });

  it("Fragment 与多节点转换：应当使用 DocumentFragment", () => {
    const code = `export const App = () => <><div>1</div><div>2</div></>;`;
    const out = compileSource(code, "test.tsx");

    expect(out).toContain("document.createDocumentFragment()");
    expect(out).toContain("insert(_frag,");
    expect(out).toContain("return _frag");
  });

  it("事件绑定与 Ref 转换：应当生成 addEventListener 和直接调用", () => {
    const code =
      `export const App = () => <button onClick={handler} ref={el => myRef = el}>Click</button>;`;
    const out = compileSource(code, "test.tsx");

    expect(out).toContain('addEventListener("click", handler)');
    expect(out).toContain("(el => myRef = el)(_el)");
  });

  it("Spread 属性转换：应当生成 spread() 调用", () => {
    const code = `export const App = () => <div {...props()}></div>;`;
    const out = compileSource(code, "test.tsx");

    expect(out).toContain("spread(_el, props())");
  });

  it("Hydration 模式：应当生成 useHydratedNode 和 _bindingMap", () => {
    const code = `export const App = () => <div>{count()}</div>;`;
    const out = compileSource(code, "test.tsx", { hydration: true });

    expect(out).toMatch(
      /useHydratedNode\("v-0"\) \|\| walk\(_el, _path\$\d+\)/,
    );
    expect(out).toContain("export const _bindingMap = [[");
    expect(out).toContain('[[1], "v-0"]');
  });

  it("优化：静态属性提升与减少冗余 Effect", () => {
    // 1. 字面量表达式提升到模板
    const code1 =
      `export const App = () => <div class={"static-class"}></div>;`;
    const out1 = compileSource(code1, "test.tsx");
    expect(out1).toContain('template("<div class=\\"static-class\\"></div>")');
    // 检查是否没有 setAttribute 相关的函数调用，但忽略 import
    const codePart1 = out1.split("\n").slice(1).join("\n");
    expect(codePart1).not.toContain("setAttribute(");

    // 2. 非响应式变量直接调用 setProperty
    const code2 = `export const App = () => <div class={myColor}></div>;`;
    const out2 = compileSource(code2, "test.tsx");
    expect(out2).toContain('setProperty(_el, "class", myColor)');
    const codePart2 = out2.split("\n").slice(1).join("\n");
    expect(codePart2).not.toContain("setAttribute(");

    // 3. 响应式表达式（含调用）使用 setAttribute
    const code3 = `export const App = () => <div class={color()}></div>;`;
    const out3 = compileSource(code3, "test.tsx");
    expect(out3).toContain('setAttribute(_el, "class", () => color())');

    // 4. 静态二元拼接提升进模板（少挂动态绑定）
    const code4 =
      `export const App = () => <div class={"btn-" + "primary"}></div>;`;
    const out4 = compileSource(code4, "test.tsx");
    expect(out4).toContain('class=\\"btn-primary\\"');
    const codePart4 = out4.split("\n").slice(1).join("\n");
    expect(codePart4).not.toContain("setAttribute(");
    expect(codePart4).not.toContain("setProperty(");

    // 5. 静态三元 / 模板串 / as 断言：提升进模板，无 setAttribute Effect
    const code5 =
      `export const App = () => <div class={true ? "on" : "off"} data-x={\`v-\${"1"}\` as any}></div>;`;
    const out5 = compileSource(code5, "test.tsx");
    expect(out5).toContain('class=\\"on\\"');
    expect(out5).toContain('data-x=\\"v-1\\"');
    const codePart5 = out5.split("\n").slice(1).join("\n");
    expect(codePart5).not.toContain("setAttribute(");

    // 6. typeof 字面量 / void 0：可序列化进模板
    const code6 =
      `export const App = () => <div data-t={typeof "x"} data-v={void 0}></div>;`;
    const out6 = compileSource(code6, "test.tsx");
    expect(out6).toContain('data-t=\\"string\\"');
    const codePart6 = out6.split("\n").slice(1).join("\n");
    expect(codePart6).not.toContain("setAttribute(");

    // 7. 静态逻辑与/或：提升进 class 模板
    const code7 =
      `export const App = () => <div class={"btn" && "btn-primary"} data-x={"" || "fallback"}></div>;`;
    const out7 = compileSource(code7, "test.tsx");
    expect(out7).toContain('class=\\"btn-primary\\"');
    expect(out7).toContain('data-x=\\"fallback\\"');
    const codePart7 = out7.split("\n").slice(1).join("\n");
    expect(codePart7).not.toContain("setAttribute(");

    // 8. 静态 ??：nullish → 右侧；空串保留（勿与 null 混淆）
    const code8 =
      `export const App = () => <div class={null ?? "fallback"} title={"" ?? "keep"}></div>;`;
    const out8 = compileSource(code8, "test.tsx");
    expect(out8).toContain('class=\\"fallback\\"');
    expect(out8).toContain('title=\\"\\"');
    expect(out8).not.toContain("null ??");
    const codePart8 = out8.split("\n").slice(1).join("\n");
    expect(codePart8).not.toContain("setAttribute(");
    expect(codePart8).not.toContain("setProperty(");
  });

  it("极致优化：应当提升静态 style 对象", () => {
    const code =
      `export const App = () => <div style={{ color: 'red', fontSize: '12px' }}></div>;`;
    const out = compileSource(code, "test.tsx");

    // 期望 style 被直接序列化进 template 字符串
    expect(out).toContain('style=\\"color:red;font-size:12px;\\"');
  });

  it("极致优化：应当内联三元运算符", () => {
    const code =
      `export const App = () => <div>{cond() ? <span>A</span> : <span>B</span>}</div>;`;
    const out = compileSource(code, "test.tsx");

    // 期望不再包含 Show 组件，而是包含 memo(() => cond() ? ... : ...)
    expect(out).toContain("memo(() => cond()");
  });

  it("优化：store/属性访问仍包 Effect；纯 Identifier 不包", () => {
    const prop = compileSource(
      `export const App = () => <div class={store.theme}></div>;`,
      "t.tsx",
    );
    expect(prop).toContain('setAttribute(_el, "class", () => store.theme)');

    const idOnly = compileSource(
      `export const App = () => <div class={themeClass}></div>;`,
      "t.tsx",
    );
    expect(idOnly).toContain('setProperty(_el, "class", themeClass)');
    expect(idOnly.split("\n").slice(1).join("\n")).not.toContain(
      "setAttribute(",
    );
  });

  it("极致优化：应当合并静态子树", () => {
    const code =
      `export const App = () => <div><span>Static 1</span><span>Static 2</span></div>;`;
    const out = compileSource(code, "test.tsx");

    // 期望两个 span 被合并进同一个 template 字符串
    expect(out).toContain(
      'template("<div><span>Static 1</span><span>Static 2</span></div>")',
    );
    // 且不应包含 walk 寻址逻辑
    expect(out).not.toContain("walk(");
  });
});

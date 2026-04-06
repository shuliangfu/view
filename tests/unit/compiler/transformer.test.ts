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
    expect(out).toContain("insert(walk(_el, [1])");
    expect(out).toContain("return _el");
  });

  it("嵌套组件转换：应当转换为函数调用", () => {
    const code =
      `export const App = () => <Show when={ok()}><span>Showed</span></Show>;`;
    const out = compileSource(code, "test.tsx");

    expect(out).toContain("Show({");
    expect(out).toContain("when: () => ok()");
    expect(out).toContain('template("<span>Showed</span>")');
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

    expect(out).toContain('useHydratedNode("v-0") || walk(_el, [1])');
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

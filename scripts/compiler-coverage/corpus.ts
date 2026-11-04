/**
 * Shared fixture corpus for compiler static-subtree coverage metrics + golden locks.
 * Measurement only — does not change compile semantics.
 */
import type { CompileOptions } from "../../src/compiler/mod.ts";

export interface Fixture {
  /** Stable id used for golden filenames and baseline keys */
  id: string;
  fileName: string;
  source: string;
  options?: CompileOptions;
  /** Short note for docs / tables */
  note: string;
}

/** Representative JSX patterns covering static lift, reactive attrs, paths, SSR, HMR. */
export const FIXTURES: Fixture[] = [
  {
    id: "static-nested",
    fileName: "static-nested.tsx",
    source: `export const App = () => <div><span>Static 1</span><span>Static 2</span></div>;`,
    note: "Fully static nested subtree → single template, no walk",
  },
  {
    id: "static-attr-concat",
    fileName: "static-attr-concat.tsx",
    source: `export const App = () => <div class={"btn-" + "primary"}></div>;`,
    note: "Static binary concat lifted into template class",
  },
  {
    id: "static-style-object",
    fileName: "static-style-object.tsx",
    source:
      `export const App = () => <div style={{ color: 'red', fontSize: '12px' }}></div>;`,
    note: "Static style object serialized into template",
  },
  {
    id: "static-ternary-attr",
    fileName: "static-ternary-attr.tsx",
    source:
      `export const App = () => <div class={true ? "on" : "off"} data-x={\`v-\${"1"}\`}></div>;`,
    note: "Static ternary + template literal attrs lifted",
  },
  {
    id: "static-and-or",
    fileName: "static-and-or.tsx",
    source:
      `export const App = () => <div class={"btn" && "btn-primary"} data-x={"" || "fallback"}></div>;`,
    note: "Static && / || attrs folded into template",
  },
  {
    id: "static-typeof-void",
    fileName: "static-typeof-void.tsx",
    source:
      `export const App = () => <div data-t={typeof "x"} data-v={void 0}></div>;`,
    note: "Static typeof / void attrs lifted into template",
  },
  {
    id: "static-nullish",
    fileName: "static-nullish.tsx",
    source:
      `export const App = () => <div class={null ?? "fallback"} title={"" ?? "keep-empty"}></div>;`,
    note: "Static ?? : nullish left → right; empty string kept (not nullish)",
  },
  {
    id: "static-satisfies",
    fileName: "static-satisfies.tsx",
    source:
      `export const App = () => <div class={"ok" satisfies string}></div>;`,
    note: "satisfies wrapper stripped; literal lifted into template",
  },
  {
    id: "static-text-concat",
    fileName: "static-text-concat.tsx",
    source:
      `export const App = () => <div>{"hello" + " world"}</div>;`,
    note: "Static string + concat child lifted into template (no walk/insert)",
  },
  {
    id: "static-text-template-ternary",
    fileName: "static-text-template-ternary.tsx",
    source:
      `export const App = () => <div>{\`hi-\${"x"}\`}{true ? "!" : "?"}</div>;`,
    note: "Static template literal + ternary text children lifted",
  },
  {
    id: "static-text-mixed",
    fileName: "static-text-mixed.tsx",
    source:
      `export const App = () => <div>pre {"a" + "b"} post {count()}</div>;`,
    note: "Static concat lifted beside dynamic child; one walk+insert remains",
  },
  {
    id: "static-true-and-jsx",
    fileName: "static-true-and-jsx.tsx",
    source:
      `export const App = () => <div>{true && <span>A</span>}</div>;`,
    note: "true && <JSX> folded into template (no walk/insert)",
  },
  {
    id: "static-false-and-jsx",
    fileName: "static-false-and-jsx.tsx",
    source:
      `export const App = () => <div>{false && <span>A</span>}</div>;`,
    note: "false && <JSX> omitted from template",
  },
  {
    id: "static-false-or-jsx",
    fileName: "static-false-or-jsx.tsx",
    source:
      `export const App = () => <div>{false || <span>A</span>}</div>;`,
    note: "false || <JSX> folded into template",
  },
  {
    id: "ssr-static-true-and-jsx",
    fileName: "ssr-static-true-and-jsx.tsx",
    source:
      `export const App = () => <div>{true && <span>A</span>}</div>;`,
    options: { generate: "ssr" },
    note: "SSR: true && <JSX> folded like CSR",
  },
  {
    id: "dyn-text",
    fileName: "dyn-text.tsx",
    source: `export const App = () => <div>{count()}</div>;`,
    note: "Dynamic child → walk + insert thunk",
  },
  {
    id: "reactive-attr",
    fileName: "reactive-attr.tsx",
    source: `export const App = () => <div class={color()}></div>;`,
    note: "Reactive attr → setAttribute Effect",
  },
  {
    id: "id-attr",
    fileName: "id-attr.tsx",
    source: `export const App = () => <div class={myColor}></div>;`,
    note: "Plain identifier → setProperty (no Effect)",
  },
  {
    id: "store-prop-attr",
    fileName: "store-prop-attr.tsx",
    source: `export const App = () => <div class={store.theme}></div>;`,
    note: "Property access → setAttribute Effect",
  },
  {
    id: "multi-attr-mixed",
    fileName: "multi-attr-mixed.tsx",
    source:
      `export const App = () => <div title={a()} class={b()}>{c()}</div>;`,
    note: "Multiple reactive attrs + dynamic child; shared path consts",
  },
  {
    id: "component-show",
    fileName: "component-show.tsx",
    source:
      `export const App = () => <Show when={ok()}><span>Showed</span></Show>;`,
    note: "Component call; static child template; reactive when wrapped",
  },
  {
    id: "component-static-when",
    fileName: "component-static-when.tsx",
    source:
      `export const App = () => <Show when={true}><span>x</span></Show>;`,
    note: "Static component prop not wrapped in arrow",
  },
  {
    id: "ternary-jsx",
    fileName: "ternary-jsx.tsx",
    source:
      `export const App = () => <div>{cond() ? <span>A</span> : <span>B</span>}</div>;`,
    note: "Inline ternary JSX → memo(); branch templates",
  },
  {
    id: "fragment",
    fileName: "fragment.tsx",
    source: `export const App = () => <><div>1</div><div>2</div></>;`,
    note: "Fragment → DocumentFragment + static child templates",
  },
  {
    id: "event-ref",
    fileName: "event-ref.tsx",
    source:
      `export const App = () => <button onClick={handler} ref={el => myRef = el}>Click</button>;`,
    note: "Event listener + ref call",
  },
  {
    id: "spread",
    fileName: "spread.tsx",
    source: `export const App = () => <div {...props()}></div>;`,
    note: "Spread props → spread()",
  },
  {
    id: "hydration-dyn-text",
    fileName: "hydration-dyn-text.tsx",
    source: `export const App = () => <div>{count()}</div>;`,
    options: { hydration: true },
    note: "Hydration: useHydratedNode + _bindingMap",
  },
  {
    id: "ssr-static",
    fileName: "ssr-static.tsx",
    source: `export const App = () => <div class="x"><span>Hi</span></div>;`,
    options: { generate: "ssr" },
    note: "SSR generate: static string concat / literal",
  },
  {
    id: "ssr-dyn",
    fileName: "ssr-dyn.tsx",
    source: `export const App = () => <div>{name}</div>;`,
    options: { generate: "ssr" },
    note: "SSR generate: dynamic child expression",
  },
  {
    id: "ssr-static-text-concat",
    fileName: "ssr-static-text-concat.tsx",
    source: `export const App = () => <div>{"hello" + " world"}</div>;`,
    options: { generate: "ssr" },
    note: "SSR: static + concat child folded into one string (CSR template parity)",
  },
  {
    id: "ssr-static-text-escape",
    fileName: "ssr-static-text-escape.tsx",
    source: `export const App = () => <div>{"a&b" + "<c>"}</div>;`,
    options: { generate: "ssr" },
    note: "SSR: static text child HTML-escaped like CSR escapeForText",
  },
  {
    id: "ssr-static-attr-concat",
    fileName: "ssr-static-attr-concat.tsx",
    source: `export const App = () => <div class={"btn-" + "primary"}></div>;`,
    options: { generate: "ssr" },
    note: "SSR: static attr concat folded like CSR template",
  },
  {
    id: "ssr-static-attr-style",
    fileName: "ssr-static-attr-style.tsx",
    source:
      `export const App = () => <div style={{ color: "red", fontSize: "12px" }}></div>;`,
    options: { generate: "ssr" },
    note: "SSR: static style object serialized (not [object Object])",
  },
  {
    id: "ssr-static-attr-logic",
    fileName: "ssr-static-attr-logic.tsx",
    source:
      `export const App = () => <div class={null ?? "fb"} data-x={"" || "y"} data-t={typeof "x"}></div>;`,
    options: { generate: "ssr" },
    note: "SSR: static ?? / || / typeof attrs folded",
  },
  {
    id: "ex-static-card",
    fileName: "ex-static-card.tsx",
    source: `export const App = () => (
  <section className="space-y-12">
    <header>
      <h2 className="text-3xl font-black tracking-tight">Form</h2>
      <p className="mt-3 text-slate-500 font-medium">createForm demo</p>
    </header>
    <div className="p-10 border rounded-3xl bg-white shadow-xl max-w-lg mx-auto space-y-8">
      <h3 className="text-xl font-black border-b pb-6">用户注册</h3>
      <label className="text-xs font-black uppercase tracking-widest">用户名</label>
    </div>
  </section>
);`,
    note: "examples/form-like static card tree → single template (no DOM ops)",
  },
  {
    id: "ex-static-class-join",
    fileName: "ex-static-class-join.tsx",
    source:
      `export const App = () => <a className={"block px-4 py-2 text-sm " + "text-indigo-600 bg-indigo-50"}>Go</a>;`,
    note: "examples/_layout-like static class + concat folded into template",
  },
  {
    id: "ex-static-tpl-class",
    fileName: "ex-static-tpl-class.tsx",
    source:
      "export const App = () => <div className={`group relative flex flex-col rounded-2xl border bg-white p-6 shadow-lg border-l-4 border-indigo-500`}><span>card</span></div>;",
    note: "examples/home-like static template-literal className (no ${})",
  },
  {
    id: "ex-static-ternary-class",
    fileName: "ex-static-ternary-class.tsx",
    source:
      `export const App = () => <button className={"px-6 py-2 rounded-xl font-bold " + (true ? "bg-indigo-600 text-white" : "bg-white text-slate-700")}>Tab</button>;`,
    note: "examples/resource-like static base + ternary class concat",
  },
  {
    id: "ex-static-array-join",
    fileName: "ex-static-array-join.tsx",
    source:
      `export const App = () => <div className={["base", "text-sm", "text-indigo-600"].join(" ")}>x</div>;`,
    note: "static Array#join class tokens folded (examples-style class lists)",
  },
  {
    id: "ex-semi-dyn-tpl-class",
    fileName: "ex-semi-dyn-tpl-class.tsx",
    source:
      "export const App = () => <div className={`base ${mod.accent}`}>x</div>;",
    note: "examples/home semi-dynamic template class → setAttribute (lock non-fold)",
  },
  {
    id: "ssr-ex-static-ternary-class",
    fileName: "ssr-ex-static-ternary-class.tsx",
    source:
      `export const App = () => <button className={"base " + (true ? "on" : "off")}>T</button>;`,
    options: { generate: "ssr" },
    note: "SSR parity: static ternary class concat folded like CSR",
  },
  {
    id: "hmr-export",

    fileName: "hmr-export.tsx",
    source: `export const App = () => <div>Hi</div>;`,
    options: { hmr: true },
    note: "HMR wraps export const component",
  },
];

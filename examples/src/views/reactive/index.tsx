/**
 * 响应式数据：createReactive
 *
 * 用于「传一个响应式对象、双向更新」的场景（如表单 model）。
 * 与 createEffect 联动：effect 内读取会登记依赖，属性赋值会触发订阅更新。
 */

import { createEffect, createSignal } from "@dreamer/view";
import { createReactive } from "@dreamer/view/reactive";
import type { VNode } from "@dreamer/view";

export const meta = {
  title: "Reactive",
  description: "createReactive 响应式表单与双向绑定示例",
  keywords: "createReactive, 表单, 双向绑定",
};

/** 统一按钮样式 */
const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
/** 统一输入框样式 */
const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";

/** 子区块标题 */
const subTitle =
  "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
/** 子区块容器 */
const block =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";

/** createReactive 表单 model：一个响应式对象贯穿整表 */
const formModel = createReactive({
  name: "",
  age: "",
  sex: "",
  fruit: "",
  choice: "a",
});

/** 自定义下拉：传 model + field；value 用 getter 避免根订阅，只在 applyProps 的 effect 里更新 */
function DropdownList(
  props: {
    options: string[];
    placeholder?: string;
    model?: Record<string, unknown>;
    field?: string;
    className?: string;
  },
): VNode {
  const { model, field } = props;
  if (!model || field == null) {
    return <select className={props.className ?? inputCls} disabled />;
  }
  return (
    <select
      className={props.className ?? inputCls}
      value={() => (model[field] as string) ?? ""}
      onChange={(e: Event) => {
        (model as Record<string, string>)[field] =
          (e.target as HTMLSelectElement).value;
      }}
    >
      {props.placeholder ? <option value="">{props.placeholder}</option> : null}
      {(props.options ?? []).map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

/** 自定义单选组：传 model + field；checked 用 getter 避免根订阅，只在 applyProps 的 effect 里更新 */
function RadioGroup(
  props: {
    options: { value: string; label: string }[];
    name?: string;
    model?: Record<string, unknown>;
    field?: string;
    className?: string;
  },
): VNode {
  const { model, field } = props;
  if (!model || field == null) return <div role="radiogroup" />;
  const name = props.name ?? "radio-group";
  return (
    <div
      className={`flex flex-wrap gap-3 ${props.className ?? ""}`}
      role="radiogroup"
    >
      {(props.options ?? []).map((opt) => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-2 text-slate-600 dark:text-slate-300"
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={() => ((model[field] as string) ?? "") === opt.value}
            onChange={() => {
              (model as Record<string, string>)[field] = opt.value;
            }}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

export function ReactiveDemo(): VNode {
  /** 用于演示 createEffect 依赖 reactive 的计数 */
  const [logCount, setLogCount] = createSignal(0);
  const reactiveState = createReactive({ count: 0 });
  createEffect(() => {
    void reactiveState.count;
    setLogCount((c) => c + 1);
  });

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
        响应式数据
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        createReactive
      </h2>
      <div className="space-y-6">
        <div className={block}>
          <h3 className={subTitle}>简介</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            createReactive(initial) 返回与 createEffect
            联动的代理对象，适合作为表单 model
            等「传一个变量、双向更新」的场景。与 store 职责分离：store
            负责完整状态（getters/actions）；reactive 仅做响应式对象。
          </p>
        </div>

        <div className={block}>
          <h3 className={subTitle}>reactive + createEffect</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            在 effect 内读取 reactive 属性会登记依赖，修改属性会触发 effect
            重新执行。
          </p>
          <p className="mb-3 flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
            <button
              type="button"
              className={btn}
              onClick={() => {
                reactiveState.count++;
              }}
            >
              reactiveState.count++
            </button>
            <span>→ effect 已执行次数：{() => logCount()}</span>
          </p>
        </div>

        <div className={block}>
          <h3 className={subTitle}>表单（统一传 createReactive model）</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            一个 createReactive 对象贯穿整表：value 支持直接值或 getter；onInput
            写回 model，自定义组件传 model + field。 根更新为 patch
            原地协调，不整树替换，表单不重挂、不丢焦点。
          </p>
          {/* value 必须传 getter：读在 applyProps 的 effect 里发生，根不会订阅 formModel，只有该 input 的 effect 会更新，不会整树重渲染、不会失焦 */}
          <div className="mb-3 flex flex-wrap gap-4 text-slate-600 dark:text-slate-300">
            <label className="flex flex-col gap-1">
              <span className="text-xs">姓名</span>
              <input
                type="text"
                className={inputCls}
                placeholder="姓名"
                value={() => formModel.name}
                onInput={(e: Event) => {
                  formModel.name = (e.target as HTMLInputElement).value;
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs">年龄</span>
              <input
                type="text"
                className={inputCls}
                placeholder="年龄"
                value={() => formModel.age}
                onInput={(e: Event) => {
                  formModel.age = (e.target as HTMLInputElement).value;
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs">性别</span>
              <input
                type="text"
                className={inputCls}
                placeholder="性别"
                value={() => formModel.sex}
                onInput={(e: Event) => {
                  formModel.sex = (e.target as HTMLInputElement).value;
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs">水果</span>
              <DropdownList
                options={["苹果", "香蕉", "橙子", "葡萄"]}
                placeholder="请选择"
                model={formModel}
                field="fruit"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs">选项</span>
              <RadioGroup
                name="choice"
                options={[{ value: "a", label: "A" }, {
                  value: "b",
                  label: "B",
                }, { value: "c", label: "C" }]}
                model={formModel}
                field="choice"
              />
            </label>
          </div>
          <p className="text-slate-600 dark:text-slate-300">
            → name={formModel.name || "(空)"}，age={formModel.age || "(空)"}
            ，sex={formModel.sex || "(空)"}，fruit={formModel.fruit || "(未选)"}
            ，choice={formModel.choice}
          </p>
        </div>
      </div>
    </section>
  );
}
export default ReactiveDemo;

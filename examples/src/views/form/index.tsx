/**
 * Form 示例：模拟 Form + FormItem + 密码框结构，用于验证「单节点 getter 重跑时 patch 不 replace、input 焦点保留」。
 * 与 ui-view 的 Form/FormItem/Password 一致：组件返回 getter，view 为占位做 patch 更新，输入时光标不丢。
 */

import type { VNode } from "@dreamer/view";
import { createSignal } from "@dreamer/view";
import "../../assets/index.css";

export const metadata = {
  title: "Form",
  description: "Form + FormItem + 密码框焦点保留验证",
  keywords: "Form, FormItem, 密码, 焦点, getter",
};

const block =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";
const labelCls =
  "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

/** 模拟 Form：返回 getter，getter 返回 form，使 view 创建动态占位并 patch 更新 */
function Form(
  props: { children?: unknown; onSubmit?: (e: Event) => void },
): () => VNode {
  return () => (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e: Event) => {
        e.preventDefault();
        props.onSubmit?.(e);
      }}
    >
      {props.children}
    </form>
  );
}

/** 模拟 FormItem：返回 getter，getter 返回 div 包 label + 输入区，与 Form 组合触发单节点 patch */
function FormItem(props: {
  label: string;
  id?: string;
  children?: unknown;
}): () => VNode {
  return () => (
    <div className="flex flex-col">
      <label htmlFor={props.id} className={labelCls}>
        {props.label}
      </label>
      <div className="form-item-input">{props.children}</div>
    </div>
  );
}

/** 密码输入：value 传 getter，不在组件体内读 value()，仅 applyProps 的 effect 更新 .value，输入时光标不丢 */
function PasswordInput(props: {
  value: string | (() => string);
  onInput?: (e: Event) => void;
  placeholder?: string;
  id?: string;
  "data-testid"?: string;
}): VNode {
  return (
    <input
      type="password"
      id={props.id}
      className={inputCls}
      value={props.value}
      onInput={props.onInput}
      placeholder={props.placeholder}
      data-testid={props["data-testid"] ?? "password-input"}
      autoComplete="off"
    />
  );
}

export function FormDemo(): VNode {
  const [password, setPassword] = createSignal("");
  const [submitted, setSubmitted] = createSignal(false);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-violet-600 dark:text-violet-400">
        Form
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        密码框焦点保留验证
      </h2>
      <p className="mb-6 text-slate-600 dark:text-slate-300">
        下方为 Form + FormItem + 密码框结构（组件返回 getter，与 ui-view
        一致）。输入时 getter 重跑，view 对占位内节点做 patch 不
        replace，光标应保持不丢。e2e 会聚焦输入、键入后断言焦点仍在输入框。
      </p>

      <div className={block}>
        <Form
          onSubmit={() => {
            setSubmitted(true);
          }}
        >
          <FormItem label="密码" id="form-password">
            <PasswordInput
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              placeholder="请输入密码"
              id="form-password"
              data-testid="form-password-input"
            />
          </FormItem>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            提交
          </button>
        </Form>
        {submitted() && (
          <p
            className="mt-3 text-sm text-emerald-600 dark:text-emerald-400"
            data-testid="form-submitted"
          >
            已提交（密码长度：{password().length}）
          </p>
        )}
      </div>
    </section>
  );
}

export default FormDemo;

/**
 * @module views/form
 * @description 展示 @dreamer/view createForm：文本／checkbox／radio／select，以及 schema 桥模式。
 */
import { createSignal } from "@dreamer/view/reactivity";
import { Show } from "@dreamer/view/control-flow";
import { createForm, messageFromSafeParse } from "@dreamer/view/form";

/** 无 Zod 依赖时的最小「类 safeParse」示意（生产可换成 z.string().email().safeParse） */
function parseEmail(value: unknown):
  | { success: true }
  | { success: false; error: { issues: { message: string }[] } } {
  const s = String(value ?? "").trim();
  if (!s) {
    return { success: false, error: { issues: [{ message: "请输入邮箱" }] } };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    return {
      success: false,
      error: { issues: [{ message: "邮箱格式不对" }] },
    };
  }
  return { success: true };
}

export default function FormDemo() {
  const [submitted, setSubmitted] = createSignal(false);

  const form = createForm(
    {
      username: "dreamer",
      password: "",
      email: "",
      bio: "致力于构建极致性能的前端框架",
      role: "user",
      plan: "free",
      agree: false,
    },
    {
      rules: {
        username: (v) => (String(v).trim() ? null : "请输入用户名"),
        password: (v) => (String(v).length >= 6 ? null : "密码至少 6 位"),
        email: (v) => messageFromSafeParse(parseEmail(v)),
        role: (v) => (v ? null : "请选择角色"),
        plan: (v) => (v ? null : "请选择方案"),
        agree: (v) => (v ? null : "请勾选同意"),
      },
    },
  );

  return (
    <section className="space-y-12">
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          高级表单 (Form Integration)
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium">
          createForm：文本、checkbox、radio、select，以及 messageFromSafeParse schema 桥。
        </p>
      </header>

      <form
        onSubmit={form.handleSubmit((data) => {
          console.log("提交数据:", data);
          setSubmitted(true);
          setTimeout(() => setSubmitted(false), 3000);
        })}
        className="p-10 border border-slate-200 dark:border-slate-700 rounded-3xl bg-white dark:bg-slate-800 shadow-xl dark:shadow-none max-w-lg mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-700 transition-colors"
      >
        <h3 className="text-xl font-black border-b border-slate-100 dark:border-slate-700 pb-6 dark:text-slate-100">
          用户注册
        </h3>

        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">
              用户名
            </label>
            <input
              {...form.field("username")}
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="请输入用户名..."
            />
            <Show when={() => !!form.errors.username}>
              <span className="text-xs text-rose-500 px-1">{() => form.errors.username}</span>
            </Show>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">
              密码
            </label>
            <input
              {...form.field("password")}
              type="password"
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="请输入密码..."
            />
            <Show when={() => !!form.errors.password}>
              <span className="text-xs text-rose-500 px-1">{() => form.errors.password}</span>
            </Show>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">
              电子邮箱
            </label>
            <input
              {...form.field("email")}
              type="email"
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="example@dreamer.com"
            />
            <Show when={() => !!form.errors.email}>
              <span className="text-xs text-rose-500 px-1">{() => form.errors.email}</span>
            </Show>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">
              角色
            </label>
            <select
              {...form.field("role", { as: "select" })}
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
              <option value="guest">访客</option>
            </select>
            <Show when={() => !!form.errors.role}>
              <span className="text-xs text-rose-500 px-1">{() => form.errors.role}</span>
            </Show>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">
              个人简介
            </label>
            <textarea
              {...form.field("bio", { as: "textarea" })}
              rows={3}
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="写点什么..."
            />
          </div>


          <div className="flex flex-col gap-2">
            <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">
              方案（radio）
            </span>
            <div className="flex flex-wrap gap-4 px-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="radio"
                  name="plan"
                  value="free"
                  {...form.field("plan", { as: "radio", value: "free" })}
                  className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Free
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="radio"
                  name="plan"
                  value="pro"
                  {...form.field("plan", { as: "radio", value: "pro" })}
                  className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Pro
              </label>
            </div>
            <Show when={() => !!form.errors.plan}>
              <span className="text-xs text-rose-500 px-1">{() => form.errors.plan}</span>
            </Show>
          </div>

          <label className="flex items-center gap-3 px-1 cursor-pointer">
            <input
              type="checkbox"
              {...form.field("agree", { as: "checkbox" })}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              我已阅读并同意服务条款
            </span>
          </label>
          <Show when={() => !!form.errors.agree}>
            <span className="text-xs text-rose-500 px-1">{() => form.errors.agree}</span>
          </Show>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 shadow-xl shadow-indigo-100 dark:shadow-none transition-all active:scale-95"
          >
            立即提交
          </button>
          <button
            type="button"
            onClick={() => form.reset()}
            className="px-8 py-3.5 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
          >
            重置
          </button>
        </div>
      </form>

      <Show when={submitted}>
        <div className="fixed top-8 left-1/2 -translate-x-1/2 p-8 bg-emerald-600 text-white rounded-3xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500 z-100">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h4 className="font-black uppercase tracking-widest text-sm">
              提交成功
            </h4>
          </div>
          <div className="bg-black/10 p-4 rounded-xl backdrop-blur-md">
            <pre className="text-xs font-mono opacity-90">{() => JSON.stringify(form.data, null, 2)}</pre>
          </div>
        </div>
      </Show>
    </section>
  );
}

/**
 * Portal 示例：createPortal 将子树挂载到指定容器（默认 document.body）
 *
 * 适用于弹窗、抽屉、toast 等需要脱离父级 DOM 层级与 overflow/z-index 的 UI。
 * 关闭时调用 root.unmount() 卸载并回收。
 */

import type { VNode } from "@dreamer/view";
import { createSignal } from "@dreamer/view";
import { createPortal } from "@dreamer/view/portal";
import type { Root } from "@dreamer/view";

export const metadata = {
  title: "Portal",
  description: "createPortal 将内容挂载到 body 或指定容器，弹窗/抽屉/toast 示例",
  keywords: "createPortal, Portal, modal, overlay, body",
};

const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
const block =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
const subTitle =
  "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

/** 通过 Portal 挂载的模态框根句柄，关闭时 unmount */
let modalRoot: Root | null = null;

/** 模态框内容：遮罩 + 居中卡片，点击遮罩或关闭按钮可关闭 */
function ModalContent(props: { onClose: () => void }): VNode {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e: Event) => {
        if ((e.target as Element).getAttribute?.("data-modal-backdrop") === "true") {
          props.onClose();
        }
      }}
      data-modal-backdrop="true"
    >
      <div
        className="max-h-[90vh] w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-600 dark:bg-slate-800"
        onClick={(e: Event) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          Portal 弹窗
        </h3>
        <p className="mb-4 text-slate-600 dark:text-slate-300">
          此内容通过 createPortal 挂载到 document.body，不受父级 overflow 或
          z-index 影响。
        </p>
        <button type="button" className={btn} onClick={props.onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}

/** Portal 示例页 */
export function PortalDemo(): VNode {
  const [open, setOpen] = createSignal(false);

  const openModal = () => {
    if (modalRoot) return;
    modalRoot = createPortal(() => (
      <ModalContent
        onClose={() => {
          if (modalRoot) {
            modalRoot.unmount();
            modalRoot = null;
          }
          setOpen(false);
        }}
      />
    ));
    setOpen(true);
  };

  const closeModal = () => {
    if (modalRoot) {
      modalRoot.unmount();
      modalRoot = null;
    }
    setOpen(false);
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
        Portal
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        createPortal
      </h2>
      <p className="mb-6 text-slate-600 dark:text-slate-300 leading-relaxed">
        使用{" "}
        <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80">
          createPortal(children, container?)
        </code>{" "}
        将子树挂载到指定 DOM（默认 document.body），适用于弹窗、抽屉、toast
        等浮层。关闭时调用返回的 Root 的 unmount()。
      </p>
      <div className={block}>
        <h3 className={subTitle}>打开弹窗</h3>
        <p className="mb-3 text-slate-600 dark:text-slate-300">
          弹窗通过 Portal 挂载到 body，当前状态：{open() ? "已打开" : "已关闭"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={openModal}>
            打开 Modal
          </button>
          <button type="button" className={btn} onClick={closeModal}>
            关闭 Modal
          </button>
        </div>
      </div>
    </section>
  );
}
export default PortalDemo;

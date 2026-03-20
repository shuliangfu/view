/**
 * @module @dreamer/view/runtime/ref-dom
 * @description
 * 编译器产出的「函数 ref」在 layout 插槽、根级清树等场景下，可能在 `el.isConnected === false` 时就被赋值。
 * 先 `ref(null)`；若当前已接入 document 则同步 `ref(el)`。
 * 否则在微任务中重试；若 `parentNode === null`（已从父摘掉）则 `ref(null)` 并停止，避免旧微任务写回已移除节点。
 * 若重试耗尽仍 `!isConnected` 但 `parentNode !== null`（仍在内存子树、尚未挂到 document），仍 `ref(el)`，并在 `requestAnimationFrame` 再检查一次；
 * 与 React 等对「离屏子树」仍持有实例引用的行为一致，避免永久 `ref(null)`。
 */

/** 微任务内重试次数上限（仅用于等 document 连接；仍不连则走 rAF / in-tree ref(el)） */
const SCHEDULE_FUNCTION_REF_MAX_MICROTASK_ATTEMPTS = 16;

/**
 * 将函数风格的 ref 绑定到元素。
 * 同步先 `ref(null)`；若 `el.isConnected` 立即 `ref(el)`。
 * 否则微任务重试；`parentNode === null` → `ref(null)`。
 * 重试耗尽：若仍在子树内则 `ref(el)`，并可选 `requestAnimationFrame` 再补一次（若已连上则再调一次 ref 无害）。
 *
 * @param el - 已 append 到某父节点下的元素
 * @param ref - `ref(null)` / `ref(el)` 回调
 */
export function scheduleFunctionRef(
  el: Element,
  ref: (node: Element | null) => void,
): void {
  ref(null);

  if (el.isConnected) {
    ref(el);
    return;
  }

  let attempts = 0;
  const commit = (): void => {
    if (el.isConnected) {
      ref(el);
      return;
    }
    if (el.parentNode === null) {
      ref(null);
      return;
    }
    attempts++;
    if (attempts >= SCHEDULE_FUNCTION_REF_MAX_MICROTASK_ATTEMPTS) {
      /**
       * 仍在子树内但未进 document：微任务阶段可能永远等不到（祖先在更晚的宏任务才挂入）。
       * 仍赋值 ref(el)，避免 focusInputEl 等永久为 null；若已脱离则 parentNode 会变为 null（上面已处理）。
       */
      ref(el);
      const raf = globalThis.requestAnimationFrame;
      if (typeof raf === "function") {
        raf(() => {
          if (el.parentNode === null) {
            ref(null);
            return;
          }
          if (el.isConnected) {
            ref(el);
          }
        });
      }
      return;
    }
    if (typeof globalThis.queueMicrotask !== "undefined") {
      globalThis.queueMicrotask(commit);
    } else {
      ref(el);
    }
  };
  if (typeof globalThis.queueMicrotask !== "undefined") {
    globalThis.queueMicrotask(commit);
  } else {
    commit();
  }
}

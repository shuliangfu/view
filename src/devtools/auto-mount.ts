/**
 * @module @dreamer/view/devtools/auto-mount
 * @description DEV-only side-effect entry: auto-mount the DevTools overlay and
 * register `createRootTracked` for {@link mountWithRouter}.
 *
 * Pulled into the client graph exclusively by `prepareDevBuild`'s virtual entry
 * wrapper — production `runBuildWithConfig` never references this module, so
 * overlay / tracked-root helpers stay out of prod bundles.
 *
 * Safe to call more than once: {@link mountDevtoolsOverlay} replaces any prior
 * instance. Failures are `console.warn` only (never throw).
 */

import { createRootTracked } from "../devtools.ts";
import { mountDevtoolsOverlay } from "./overlay.ts";

declare global {
  // eslint-disable-next-line no-var
  var __VIEW_BOOT_DEVTOOLS__: (() => void) | undefined;
  // eslint-disable-next-line no-var
  var __VIEW_CREATE_ROOT_TRACKED__:
    | (<T>(fn: (dispose: () => void) => T) => T)
    | undefined;
}

function mountSafe(): void {
  try {
    mountDevtoolsOverlay();
  } catch (err) {
    console.warn("[view] DevTools overlay failed to mount:", err);
  }
}

/** Idempotent boot used by the HMR banner microtask + this module's own load. */
export function bootDevtoolsOverlay(): void {
  if ((globalThis as { VIEW_DEV?: boolean }).VIEW_DEV !== true) return;
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountSafe, { once: true });
  } else {
    mountSafe();
  }
}

const g = globalThis as typeof globalThis & {
  __VIEW_BOOT_DEVTOOLS__?: () => void;
  __VIEW_CREATE_ROOT_TRACKED__?: <T>(fn: (dispose: () => void) => T) => T;
};

g.__VIEW_BOOT_DEVTOOLS__ = bootDevtoolsOverlay;
g.__VIEW_CREATE_ROOT_TRACKED__ = createRootTracked;

bootDevtoolsOverlay();

/**
 * Union of APIs used across examples/src — 3.0: core from main barrel,
 * router/form/resource from subpaths (matches production recommendation).
 */
export {
  createContext,
  createEffect,
  createSelector,
  createSignal,
  createStore,
  ErrorBoundary,
  For,
  Portal,
  produce,
  Show,
  Suspense,
  useContext,
  useTransition,
} from "../../../src/mod.ts";
export { createForm, messageFromSafeParse } from "../../../src/form.ts";
export { createResource } from "../../../src/resource.ts";
export {
  createRouter,
  Link,
  mountWithRouter,
  useRouter,
} from "../../../src/router.ts";

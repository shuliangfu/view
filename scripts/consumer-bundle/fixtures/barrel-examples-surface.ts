/**
 * Union of APIs used across examples/src — 3.0: core from main barrel,
 * router/form/resource from subpaths (matches production recommendation).
 */
export {
  ErrorBoundary,
  For,
  Portal,
  Show,
  Suspense,
  createContext,
  createEffect,
  createSelector,
  createSignal,
  createStore,
  produce,
  useContext,
  useTransition,
} from "../../../src/mod.ts";
export { createForm, messageFromSafeParse } from "../../../src/form.ts";
export { createResource } from "../../../src/resource.ts";
export {
  Link,
  createRouter,
  mountWithRouter,
  useRouter,
} from "../../../src/router.ts";

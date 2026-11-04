/**
 * Union of APIs used across examples/src (views + stores + router),
 * imported through the convenience barrel — counterfactual “全家桶” cost
 * if examples had not migrated to subpaths.
 */
export {
  ErrorBoundary,
  For,
  Link,
  Portal,
  Show,
  Suspense,
  createContext,
  createEffect,
  createForm,
  createResource,
  createRouter,
  createSelector,
  createSignal,
  createStore,
  messageFromSafeParse,
  mountWithRouter,
  produce,
  useContext,
  useRouter,
  useTransition,
} from "../../../src/mod.ts";

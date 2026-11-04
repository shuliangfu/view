/**
 * App-local barrel that named-reexports from @dreamer/view main entry.
 * With esbuild + sideEffects:false this often still shakes; pair with
 * app-reexport-from-subpath for the recommended pattern.
 */
export {
  For,
  Show,
  createForm,
  createResource,
  createRouter,
  createSignal,
  mountWithRouter,
} from "../../../src/mod.ts";

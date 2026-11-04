/**
 * Consumer fixture: mixed app that pulls router + form + resource + For
 * through the convenience barrel (worst-case “全家桶” import habit).
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

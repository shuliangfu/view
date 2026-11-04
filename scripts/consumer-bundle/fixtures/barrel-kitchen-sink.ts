/**
 * Consumer fixture (3.0): core symbols via main barrel + integrations via subpaths.
 * (Pre-3.0 pulled router/form/resource through the convenience barrel.)
 */
export { For, Show, createSignal } from "../../../src/mod.ts";
export { createForm } from "../../../src/form.ts";
export { createResource } from "../../../src/resource.ts";
export { createRouter, mountWithRouter } from "../../../src/router.ts";

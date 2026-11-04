/**
 * Consumer fixture (3.0): router is **subpath-only**.
 * Named imports go through `/router` (same symbols as pre-3.0 barrel).
 * Paired with subpath-router-api (identical graph expected).
 */
export {
  createRouter,
  mountWithRouter,
} from "../../../src/router.ts";

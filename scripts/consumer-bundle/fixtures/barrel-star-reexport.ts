/**
 * Anti-pattern / library-entry style: re-export the whole convenience barrel.
 * Matches what size-baseline entry-main measures; defeats named-export shaking.
 */
export * from "../../../src/mod.ts";

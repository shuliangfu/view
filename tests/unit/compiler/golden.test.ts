/**
 * Golden lock for compileSource() output over the P0-3 corpus.
 * Fixtures + expected files live under scripts/compiler-coverage/.
 *
 * Path/FS via @dreamer/runtime-adapter so Deno / Bun / Node unit runners all resolve.
 */
import { describe, expect, it } from "@dreamer/test";
import {
  dirname,
  fromFileUrl,
  join,
  readTextFile,
} from "@dreamer/runtime-adapter";
import { compileSource } from "@dreamer/view/compiler";
import { FIXTURES } from "../../../scripts/compiler-coverage/corpus.ts";
import { normalizeGolden } from "../../../scripts/compiler-coverage/metrics.ts";

const GOLDENS = join(
  dirname(fromFileUrl(import.meta.url)),
  "../../../scripts/compiler-coverage/goldens",
);

describe("compiler/golden (P0-3 static-subtree corpus)", () => {
  it("corpus has expected fixture count", () => {
    expect(FIXTURES.length).toBe(19);
  });

  for (const f of FIXTURES) {
    it(`golden: ${f.id}`, async () => {
      const expectedPath = join(GOLDENS, `${f.id}.out.txt`);
      const expected = normalizeGolden(await readTextFile(expectedPath));
      const actual = normalizeGolden(
        compileSource(f.source, f.fileName, f.options ?? {}),
      );
      expect(actual).toBe(expected);
    });
  }

  it("static-nested / static-attr-concat emit no walk or setAttribute", () => {
    for (const id of ["static-nested", "static-attr-concat", "static-style-object"]) {
      const f = FIXTURES.find((x) => x.id === id)!;
      const body = normalizeGolden(compileSource(f.source, f.fileName))
        .split("\n")
        .slice(1)
        .join("\n");
      expect(body).not.toContain("walk(");
      expect(body).not.toContain("setAttribute(");
      expect(body).not.toContain("setProperty(");
    }
  });

  it("reactive-attr uses setAttribute; id-attr uses setProperty", () => {
    const reactive = FIXTURES.find((x) => x.id === "reactive-attr")!;
    const idAttr = FIXTURES.find((x) => x.id === "id-attr")!;
    const rBody = normalizeGolden(
      compileSource(reactive.source, reactive.fileName),
    ).split("\n").slice(1).join("\n");
    const iBody = normalizeGolden(
      compileSource(idAttr.source, idAttr.fileName),
    ).split("\n").slice(1).join("\n");
    expect(rBody).toContain("setAttribute(");
    expect(rBody).not.toContain("setProperty(");
    expect(iBody).toContain("setProperty(");
    expect(iBody).not.toContain("setAttribute(");
  });
});

/**
 * Extract reproducible compiler-output metrics from compileSource() text.
 * Counts call sites in the *body* (after the injected import line(s)).
 */
export interface OutputMetrics {
  /** Bytes of full compiled output (UTF-8) */
  outputBytes: number;
  templateCalls: number;
  walkCalls: number;
  insertCalls: number;
  /** Reactive attribute bindings (typically Effect-backed) */
  setAttributeCalls: number;
  /** One-shot property writes (no Effect) */
  setPropertyCalls: number;
  spreadCalls: number;
  memoCalls: number;
  pathConstDecls: number;
  /** Assignments to `_tmpl$N` (module-level template consts) */
  tmplConstDecls: number;
  hasBindingMap: boolean;
  importHasMemo: boolean;
  importHasCreateHMRProxy: boolean;
  /**
   * Heuristic: no walk / setAttribute / setProperty / spread in body.
   * True for fully-static templates and some static component shells.
   */
  zeroReactiveDomOps: boolean;
}

export function stripImportHead(output: string): {
  head: string;
  body: string;
} {
  const lines = output.split("\n");
  let i = 0;
  while (i < lines.length && /^\s*import\s/.test(lines[i]!)) i++;
  return {
    head: lines.slice(0, i).join("\n"),
    body: lines.slice(i).join("\n"),
  };
}

function countRe(haystack: string, re: RegExp): number {
  const m = haystack.match(re);
  return m ? m.length : 0;
}

export function measureOutput(output: string): OutputMetrics {
  const { head, body } = stripImportHead(output);
  const setAttributeCalls = countRe(body, /\bsetAttribute\s*\(/g);
  const setPropertyCalls = countRe(body, /\bsetProperty\s*\(/g);
  const walkCalls = countRe(body, /\bwalk\s*\(/g);
  const spreadCalls = countRe(body, /\bspread\s*\(/g);
  return {
    outputBytes: new TextEncoder().encode(output).length,
    templateCalls: countRe(body, /\btemplate\s*\(/g),
    walkCalls,
    insertCalls: countRe(body, /\binsert\s*\(/g),
    setAttributeCalls,
    setPropertyCalls,
    spreadCalls,
    memoCalls: countRe(body, /\bmemo\s*\(/g),
    pathConstDecls: countRe(body, /\bconst\s+_path\$\d+\b/g),
    tmplConstDecls: countRe(body, /\b_tmpl\$\d+\s*=/g),
    hasBindingMap: /_bindingMap/.test(body),
    importHasMemo: /\bmemo\b/.test(head),
    importHasCreateHMRProxy: /\bcreateHMRProxy\b/.test(head),
    zeroReactiveDomOps: setAttributeCalls === 0 && setPropertyCalls === 0 &&
      walkCalls === 0 && spreadCalls === 0,
  };
}

/** Normalize printer whitespace for stable golden compare. */
export function normalizeGolden(output: string): string {
  return output
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "\n");
}

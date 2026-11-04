# P0: examples browser E2E into CI

| Item | Value |
|------|-------|
| Target | `@dreamer/view` **v2.2.0**, branch `dev` |
| Date | **2026-11-04** (Asia/Shanghai) |
| Nature | **CI + docs**: no runtime semantics change; no JSR / npm; does **not** relax E2E assertions or size / consumer-bundle baselines |

---

## 1. What landed

| Piece | Detail |
|-------|--------|
| CI job | `e2e-examples` on **`ubuntu-latest` only** |
| Browser | Playwright **Chromium** `1.59.1` (`npx playwright@1.59.1 install --with-deps chromium`) |
| Command | `deno task test:e2e` → `deno test -A tests/e2e` |
| Fail policy | Job failure fails the workflow (same strict assertions as local, including form `agree`) |

The existing **9-job** Deno / Bun / Node × Linux / macOS / Windows **unit + integration** matrix is **unchanged** and stays **browser-free**.

---

## 2. Local vs CI

| Command | Scope | Where |
|---------|-------|-------|
| `deno task test` | `tests/unit` + `tests/integration` (no E2E) | Local daily + CI matrix |
| `deno task test:e2e` | `tests/e2e` (examples site + Chromium) | Local + CI job `e2e-examples` |
| `deno test -A tests` | unit + integration + **e2e** | Local full Deno suite (requires Chromium installed) |

**Prerequisite for E2E (local or CI):** Chromium for Playwright, e.g.

```bash
npx -y playwright@1.59.1 install chromium
# or with OS libs (CI Ubuntu uses --with-deps):
npx -y playwright@1.59.1 install --with-deps chromium
```

E2E starts `examples` via `deno task dev` (same as a manual run), probes a free port from **8787**, then drives pages with `@dreamer/test` + Playwright.

---

## 3. Why not fold E2E into every matrix cell

- Needs Playwright Chromium + a live examples dev server (cold compile / longer wall time).
- Windows / some runners historically flakier for browser teardown; the suite already widens locator timeouts when `CI=true`.
- Dragging E2E onto Bun / Node / Windows cells would inflate cost and flake without extra coverage of the Deno examples path that the suite actually targets.

So: **one stable Ubuntu + Chromium job**; matrix stays unit/integration only (comments in `.github/workflows/ci.yml`).

---

## 4. Non-goals

- No assertion relaxation
- No change to production defaults / size / consumer-bundle budgets
- No JSR / npm publish
- No Bun / Node / Windows browser E2E matrix expansion in this knife

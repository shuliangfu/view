# @dreamer/view analysis doc status

| Item | Value |
|------|-------|
| Date | **2026-11-03** (Asia/Shanghai) |
| Nature | **Docs governance**: mark obsolete / drifted analysis; point to current docs; **no** runtime changes |
| Current analysis | [`../zh-CN/view-framework-analysis.md`](../zh-CN/view-framework-analysis.md) (Chinese; canonical) |
| Getting started / API | [`README.md`](./README.md) · [`../zh-CN/README.md`](../zh-CN/README.md) |
| Bundle / perf baseline | [`P0-baseline-bundle-and-perf.md`](./P0-baseline-bundle-and-perf.md) |
| Note | Root `analysis/` is **gitignored** (local working copies). This index + `docs/` are authoritative in-repo. |

---

## 1. Current (read these first)

| Doc | Notes |
|-----|-------|
| [`../zh-CN/view-framework-analysis.md`](../zh-CN/view-framework-analysis.md) | **2026-11-03** read-only framework optimization feasibility (v2.2.0) |
| [`README.md`](./README.md) | English getting started / API |
| [`P0-baseline-bundle-and-perf.md`](./P0-baseline-bundle-and-perf.md) | Bundle / bench baseline |
| [`P0-4-component-author-guide.md`](./P0-4-component-author-guide.md) · [`../zh-CN/P0-4-component-author-guide.md`](../zh-CN/P0-4-component-author-guide.md) | Component author guide (Memo / ref / subscription boundaries) |
| [`CHANGELOG.md`](./CHANGELOG.md) | Changelog |

---

## 2. Obsolete / drifted (v1 / early architecture) — do not treat as current

If present under local `analysis/`, these should carry an obsolete watermark. They often still describe **VNode / directive** paths (`v-if` / `v-html`, etc.) or retired rewrite blueprints:

- `analysis/OPTIMIZATION_ANALYSIS.md`
- `analysis/DEEP_OPTIMIZATION_AND_SOLID_ALIGNMENT.md`
- `analysis/框架优化分析.md`
- `analysis/IMPLEMENTATION_ANALYSIS.md`
- `analysis/GAPS_AND_COMPLETION.md`
- `analysis/FEATURE_COMPLETENESS.md`
- `analysis/SOLID_CORE_IMPLEMENTATION_PLAN.md`
- `analysis/NEXT_GEN_REARCH_PLAN.md`
- `analysis/NEXT_GEN_IMPLEMENTATION_DETAILS.md`
- `analysis/MEMORY_LEAK_ANALYSIS.md`
- `analysis/LIFECYCLE_AND_HOOKS.md`
- `analysis/FRAMEWORK_COMPARISON.md`

Full Chinese table: [`../zh-CN/分析文档状态.md`](../zh-CN/分析文档状态.md).

---

## 3. Superseded for decisions

| Local path | Notes |
|------------|-------|
| `analysis/全面分析-优化空间.md` | Baseline **v2.0.3 / 2026-07-10**; use current `view-framework-analysis.md` for decisions |

---

## 4. Planning memo (not a shipped changelog)

| Doc | Notes |
|-----|-------|
| [`../zh-CN/3.0.0-规划分析.md`](../zh-CN/3.0.0-规划分析.md) | 3.0 breaking-direction memo (baseline 2.1.0); 2.x shipped items → CHANGELOG / current analysis |

---

**Do not** treat obsolete `analysis/` notes as the API contract. Breaking defaults need an explicit product decision.

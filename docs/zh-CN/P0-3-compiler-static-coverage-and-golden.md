# P0-3：编译器静态子树覆盖率基线 + golden

| 项 | 值 |
|----|-----|
| 对象 | `@dreamer/view` **v2.2.0**，分支 `dev` |
| 日期 | **2026-11-04**（Asia/Shanghai） |
| 性质 | **文档 + 度量／golden 门禁**：只度量当前 `compileSource()` 产物；**不改默认编译语义**；禁 JSR／npm |
| 配套 | 体积门禁（`size:check`）、bench 门禁（`bench:check`）；本刀补 **编译器静态子树覆盖率指标 + golden** |

---

## 1. 指标含义

在固定 JSX 语料（`scripts/compiler-coverage/corpus.ts`，32 条）上调用
`compileSource()`，对**注入 import 之后的 body**计数：

| 指标 | 含义 |
|------|------|
| `template` / `_tmpl$` | 模板克隆路径 |
| `walk` / `_path$` | 动态节点寻址 |
| `insert` | 子节点挂载（常含 thunk） |
| `setAttribute` | 响应式属性（通常走 Effect） |
| `setProperty` | 一次性属性写（不包 Effect） |
| `spread` / `memo` | spread 与三元内联 memo |
| `zeroReactiveDomOps` | body 中无 walk／setAttribute／setProperty／spread |
| `staticDomOpFreeRatio` | 语料中 `zeroReactiveDomOps` 占比（基线约 **0.7188**＝23/32） |

**本刀是基线**：把「当前编译器已经吃到的静态提升」锁住，防止静默回退；
**不是**立刻把覆盖率吃满到「默认产物几乎零通用 Effect」。

---

## 2. 命令

```bash
deno task compiler:coverage:baseline   # measure.ts --write → JSON + goldens/
deno task compiler:coverage:check      # 指标精确对齐 + golden 全文对齐
deno test -A --no-check tests/unit/compiler/golden.test.ts
```

CI：ubuntu job `compiler-coverage-check` 跑 `deno task compiler:coverage:check`。

故意改编译产物时：刷新基线并入库 JSON／goldens，在 CHANGELOG 说明原因。

---

## 3. Golden

| 路径 | 作用 |
|------|------|
| `scripts/compiler-coverage/goldens/<id>.out.txt` | 规范化后的完整 `compileSource` 输出 |
| `tests/unit/compiler/golden.test.ts` | 对语料逐条 `toBe`；另断言静态／响应式关键模式 |

语料覆盖：全静态子树、静态属性／style／三元／&&／||／??／typeof／void／satisfies 提升、静态子文本 +／模板串／三元、动态文本、响应式／Identifier／store
属性、多位点 path、组件 props、三元 JSX＋memo、Fragment、事件／ref、spread、
hydration `_bindingMap`、SSR、HMR。

---

## 4. 非目标（本刀）

- 不改 analyzer／transformer／runtime 默认语义
- 不推倒响应式内核；不把「吃满编译器优化」塞进本刀
- 不发 JSR／npm；不改 ui-view／dweb-admin 产品项

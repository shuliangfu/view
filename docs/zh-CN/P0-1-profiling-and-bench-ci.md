# P0-1：真实页 Profiling 对照 + bench 入 CI

| 项 | 值 |
|----|-----|
| 对象 | `@dreamer/view` **v2.2.0**，分支 `dev` |
| 日期 | **2026-11-03**（Asia/Shanghai） |
| 性质 | **文档 + 度量门禁**：不改运行时默认语义；**探针不进 `src/` 热路径**；禁 JSR／npm |
| 配套 | 体积门禁已有（`deno task size:check`）；本刀补 **bench／Profiling** |

---

## 1. 微型 bench 覆盖（CI）

| 文件 | 覆盖 |
|------|------|
| `tests/bench/signal.bench.ts` | Signal 写／同值跳过、**Effect** ×N + `batch` |
| `tests/bench/for.bench.ts` | `For`+key 创建／反转／字段更新（happy-dom） |
| `tests/bench/insert.bench.ts` | `insert` 静态文本／Signal thunk 更新／数组子节点 |

命令：

```bash
deno task bench                 # 人类可读
deno task bench:baseline        # 写入 scripts/bench-baseline/bench-baseline.json
deno task bench:check           # 对照基线 avgNs（默认 ≤ +100%）
```

CI：ubuntu job `bench-check`，环境变量 `BENCH_BUDGET_PCT=300`（Actions 机与参考 CPU
不同，放宽到仍能拦数量级回退）。本地默认 +100%。`--smoke`／`BENCH_SMOKE=1` 只要求跑通。

---

## 2. 真实页 Profiling（对照说明）

**不要**默认在 `src/` 里加 Effect／DOM 计数器。推荐顺序：

### 2.1 Chrome Performance（首选）

1. 打开真实页：
   - **ui-view 文档站**（列表／表单／路由切换较全），或
   - **dweb-admin** 数据面板（刷新、筛选、表格重绘）。
2. DevTools → **Performance** → 录制一次「列表更新／路由切换／表单提交」。
3. 对照 **Scripting** vs **Rendering／Painting**；记下主线程长任务与 `Recalculate Style`。
4. 改动前后各录一次，把截图／摘要附在 PR／分析笔记（可放本机 `analysis/`，勿强制入库二进制）。

### 2.2 一次性本地探针（可选）

仓库示例（仅脚本，不进运行时）：

```bash
deno run -A scripts/profiling/local-probe-example.ts
# 路由来回：Owner／订阅／叶子 Effect 启发式（可 VIEW_PROBE_ITERS=N）
deno run -A scripts/profiling/route-churn-probe.ts
```

在**应用侧**临时包装 `createEffect`／`insert` 统计调用次数亦可；用完即删，**禁止**合进 `src/` 默认路径。
`route-churn-probe.ts` 只读测量 dispose／订阅规模，**不**进运行时热路径；发现泄漏再另开运行时刀。

### 2.3 与微型 bench 的关系

| 手段 | 回答的问题 |
|------|------------|
| `deno task bench`／CI gate | 内核热路径有没有数量级回退？ |
| Chrome Performance | 真实页瓶颈在脚本、布局还是网络？ |
| 本地探针 | 某次改动 Effect／insert 次数有没有暴涨？ |

三者互补；**无真实页对照时，不要只凭 bench 微秒差推倒内核。**

---

## 3. 非目标（本刀）

- 不改响应式默认行为／调度／`insert` 语义
- 不把虚拟列表、时间分片、编译器默认语义变更塞进本刀
- 不发 JSR／npm

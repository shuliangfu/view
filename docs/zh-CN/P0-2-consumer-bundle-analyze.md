# P0-2：消费方／examples 主入口 bundle analyze + 体积预算

| 项           | 值                                                                            |
| ------------ | ----------------------------------------------------------------------------- |
| 对象         | `@dreamer/view` **v2.2.0**，分支 `dev`                                        |
| 性质         | **只度量／门禁**：脚本＋JSON＋文档；**未改**运行时语义、默认导出、JSR／npm    |
| 工具         | esbuild **0.27.7**（与 `size-baseline` 同系）                                 |
| 复现         | `deno task consumer:bundle:baseline` · `deno task consumer:bundle:check`      |
| 产物         | `scripts/consumer-bundle/` · `consumer-bundle-baseline.json`                  |
| 与既有闸关系 | **独立**于 `deno task size:check`；**不**放宽 `bundle-size-baseline.json` +5% |

---

## 1. 测什么

既有 P0 体积基线（`scripts/size-baseline/`）度量的是 **库入口** `export *`
图。本刀补 **消费方导入方式**：

1. **具名导入**：从便捷全家桶 `@dreamer/view` vs 从
   `/reactivity`／`/csr`／`/router` 等取同一组符号。
2. **星号再导出／命名空间**：`export * from "@dreamer/view"`、`import * as View from "..."`
   —— 这才是「全家桶」真实成本场景。
3. **examples 主入口**：对齐 `examples/src/main.tsx`（已走
   `@dreamer/view/router`）。
4. **examples API
   并集**：跨页面用到的符号集合（具名），对照「若仍从主入口具名导入」的反事实。

夹具目录：`scripts/consumer-bundle/fixtures/`。

---

## 2. 关键数字摘要（基线快照）

> 精确字节以入库 `consumer-bundle-baseline.json`
> 为准；下表为可读摘要（minify／gzip(min)）。

### 2.1 具名导入（esbuild + `sideEffects: false`）

| 场景                                     | barrel minify | 子路径 minify |       Δ |
| ---------------------------------------- | ------------: | ------------: | ------: |
| Signal／Effect／Memo／Store              |     ~7.25 KiB |     ~7.25 KiB | **≈ 0** |
| CSR：signal + mount + For/Show           |    ~11.31 KiB |    ~11.31 KiB | **≈ 0** |
| Router：createRouter + mountWithRouter   |    ~25.85 KiB |    ~25.85 KiB | **≈ 0** |
| kitchen-sink（router+form+resource+For） |    ~33.14 KiB |    ~33.14 KiB | **≈ 0** |
| examples API 并集                        |    ~36.17 KiB |    ~36.17 KiB | **≈ 0** |

**解读：** 在 esbuild
下，**具名**从主入口导入通常能摇到与子路径接近的产物体积。子路径仍值得默认推荐：模块图更小（metafile
`#src` 更少）、意图清晰、且在弱摇树／本地 `export *` 包装时有保护。

### 2.2 星号再导出（真实全家桶溢价）

| 夹具                                        |         minify |      gzip(min) | #src |
| ------------------------------------------- | -------------: | -------------: | ---: |
| `barrel-star-reexport`（`export *` 主入口） | **~44.57 KiB** | **~15.76 KiB** |   33 |
| `subpath-star-reactivity`                   |     ~10.46 KiB |      ~3.85 KiB |   13 |
| `subpath-star-csr`                          |     ~30.63 KiB |     ~10.85 KiB |   28 |

相对只需要 reactivity 却 `export *` 了主入口：

- minify 溢价约 **+34.1 KiB**（约 **4.26×**）
- gzip 溢价约 **+11.9 KiB**

与库入口基线 `size-baseline` 的 `@dreamer/view` 行同量级（本刀不改该闸）。

### 2.3 examples 主入口

| 夹具                    | 含义                                                   |     minify |
| ----------------------- | ------------------------------------------------------ | ---------: |
| `examples-main-subpath` | 镜像 `examples/src/main.tsx` 的 view 导入（`/router`） | ~25.85 KiB |

examples **已**全面子路径化；本刀只量化、不改 examples 产品代码。

---

## 3. 门禁

```bash
deno task consumer:bundle:check
# CI job: consumer-bundle-check（ubuntu）
```

默认：**各夹具 minify／gzip(min) ≤ 基线 +5%**（`Math.ceil`）。\
覆写：`--budget-pct` 或环境变量 `CONSUMER_BUNDLE_BUDGET_PCT`。

故意涨包：`deno task consumer:bundle:baseline` 后提交 JSON，并在 CHANGELOG
说明原因。

---

## 4. 建议（文档／消费方，非本刀改码）

1. 应用与 examples 继续默认 **子路径**（现状已对齐）。
2. 避免应用内 `export * from "@dreamer/view"` 或把主入口再封一层全家桶。
3. 库入口体积仍看 `deno task size:check`；消费方导入方式看本闸。

---

## 5. 相关

- 库入口体积：[`P0-基线-体积与性能.md`](./P0-基线-体积与性能.md) ·
  `scripts/size-baseline/`
- 组件作者指南：[`P0-4-component-author-guide.md`](./P0-4-component-author-guide.md)
- 主入口弃用预告（策略
  A）：[`P1-1-main-entry-deprecation-preview.md`](./P1-1-main-entry-deprecation-preview.md)
- EN：[`../en-US/P0-2-consumer-bundle-analyze.md`](../en-US/P0-2-consumer-bundle-analyze.md)

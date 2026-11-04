# P0：examples 浏览器 E2E 入 CI

| 项   | 值                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------- |
| 目标 | `@dreamer/view` **v2.2.0**，分支 `dev`                                                                   |
| 日期 | **2026-11-04**（Asia/Shanghai）                                                                          |
| 性质 | **CI + 文档**：无运行时语义变更；禁 JSR／npm；**不**放宽 E2E 断言，**不**放宽 size／consumer-bundle 基线 |

---

## 1. 落地内容

| 项       | 说明                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| CI job   | `e2e-examples`，**仅** `ubuntu-24.04`（勿用 `ubuntu-latest`／26.04：PW 1.59.1 不支持）   |
| 浏览器   | Playwright **Chromium** `1.59.1`（`npx playwright@1.59.1 install --with-deps chromium`） |
| 命令     | `deno task test:e2e` → `deno test -A tests/e2e`                                          |
| 失败策略 | job 失败即整条 workflow 红（与本地同严断言，含 form `agree`）                            |

既有 **9-job** Deno／Bun／Node × Linux／macOS／Windows **unit＋integration**
矩阵**不变**，且保持**无浏览器**。

---

## 2. 本地 vs CI

| 命令                 | 范围                                        | 场景                              |
| -------------------- | ------------------------------------------- | --------------------------------- |
| `deno task test`     | `tests/unit`＋`tests/integration`（无 E2E） | 本地日常＋CI 矩阵                 |
| `deno task test:e2e` | `tests/e2e`（examples 站＋Chromium）        | 本地＋CI job `e2e-examples`       |
| `deno test -A tests` | unit＋integration＋**e2e**                  | 本地 Deno 全量（需已装 Chromium） |

**E2E 前置（本地／CI）：** Playwright 用 Chromium，例如：

```bash
npx -y playwright@1.59.1 install chromium
# 或带系统库（CI Ubuntu 使用 --with-deps）：
npx -y playwright@1.59.1 install --with-deps chromium
```

E2E 会以 `deno task dev` 拉起 `examples`（与手动一致），从 **8787**
起探测空闲端口，再用 `@dreamer/test`＋Playwright 驱动页面。

---

## 3. 为何不塞进每个矩阵格子

- 需要 Playwright Chromium＋存活的 examples 开发服（冷编译／墙钟更长）。
- Windows／部分 runner 上浏览器 teardown 更易抖；套件在 `CI=true` 时已放宽
  locator 超时。
- 把 E2E 拖进 Bun／Node／Windows 格子只会抬成本与 flake，却几乎不增加 Deno
  examples 路径的覆盖。

因此：**一个稳定的 Ubuntu＋Chromium job**；矩阵仍只跑 unit／integration（见
`.github/workflows/ci.yml` 注释）。

---

## 4. 非目标

- 不放宽断言
- 不改生产默认／size／consumer-bundle 预算
- 禁 JSR／npm 发版
- 本件不扩展 Bun／Node／Windows 浏览器 E2E 矩阵

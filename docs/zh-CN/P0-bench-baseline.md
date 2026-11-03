# @dreamer/view 性能基线（`deno task bench`）

| 项 | 值 |
|----|-----|
| 日期 | 2026-11-03（Asia/Shanghai） |
| 命令 | `deno task bench`（=`deno bench -A tests/bench/`） |
| CPU | Apple M5 Max |
| Runtime | Deno 2.9.8（aarch64-apple-darwin） |
| 提交基线 | `592997c`（测量前 HEAD） |

## Signal / Effect（`tests/bench/signal.bench.ts`）

| benchmark | time/iter (avg) | iter/s |
|-----------|----------------:|-------:|
| signal write + Object.is 同值跳过 | 2.6 µs | 390,600 |
| signal write 1000 次不同值（无订阅者） | 3.8 µs | 264,900 |
| 1 signal × 10 effect，batch 内写一次 | 2.4 µs | 424,800 |
| 1 signal × 100 effect，batch 内写一次 | 13.2 µs | 75,760 |
| batch 内 50 次 signal 写、10 个 effect | 3.3 µs | 302,000 |

## For+key（`tests/bench/for.bench.ts`，happy-dom）

| benchmark | time/iter (avg) | iter/s |
|-----------|----------------:|-------:|
| For+key 创建 200 行 | 1.6 ms | 612.0 |
| For+key 反转 200 行（重排） | 2.2 ms | 455.5 |
| For+key 仅改字段不重排 200 行 | 2.3 ms | 436.2 |

> 同机二次跑动会有 ±5–10% 抖动；上表取第二次完整跑次。原始终端输出见 `bench-baseline-raw.txt`。

## 真实页 Effect／DOM 操作计数

当前 **核心未内置** Effect／DOM 操作计数器（本刀不改响应式内核）。测量方式见同目录报告「如何测 Effect／DOM」小节，以及 `scripts/size-baseline/README.md`。

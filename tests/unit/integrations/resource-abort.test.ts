import { describe, expect, it } from "@dreamer/test";
import {
  createInflightDedupe,
  createResource,
  createSignal,
} from "@dreamer/view";

async function tick(n = 5) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

describe("integrations/resource AbortSignal + inflight dedupe", () => {
  it("passes AbortSignal to fetcher; source change aborts previous", async () => {
    const id = createSignal(1);
    const seen: AbortSignal[] = [];
    let resolveSlow: ((v: string) => void) | undefined;

    const resource = createResource(
      () => id.value,
      (source, info) => {
        seen.push(info.signal);
        if (source === 1) {
          return new Promise<string>((resolve) => {
            resolveSlow = resolve;
          });
        }
        return Promise.resolve(`ok-${source}`);
      },
    );

    await tick(10);
    expect(resource.loading()).toBe(true);
    expect(seen.length).toBeGreaterThanOrEqual(1);
    const beforeSwitch = seen[seen.length - 1]!;
    expect(beforeSwitch.aborted).toBe(false);

    id.value = 2;
    await tick(10);

    expect(beforeSwitch.aborted).toBe(true);
    expect(resource.loading()).toBe(false);
    expect(resource()).toBe("ok-2");
    expect(resource.error()).toBeNull();
    // late resolve of aborted load must not overwrite
    resolveSlow?.("stale-1");
    await tick(5);
    expect(resource()).toBe("ok-2");
  });

  it("fetcher AbortError on superseded load does not set resource.error", async () => {
    let call = 0;
    const resource = createResource((_s, { signal }) => {
      call++;
      if (call === 1) {
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }
      return Promise.resolve("ok");
    });

    await tick();
    expect(resource.loading()).toBe(true);

    await resource.refetch();
    await tick(10);

    expect(resource.error()).toBeNull();
    expect(resource()).toBe("ok");
    expect(resource.loading()).toBe(false);
  });

  it("options.signal aborts in-flight load without error", async () => {
    const outer = new AbortController();
    let gotSignal: AbortSignal | undefined;

    const resource = createResource(
      () => 1,
      (_id, info) => {
        gotSignal = info.signal;
        return new Promise<string>(() => {
          /* pending until abort */
        });
      },
      { signal: outer.signal },
    );

    await tick(10);
    expect(resource.loading()).toBe(true);
    expect(gotSignal?.aborted).toBe(false);

    outer.abort();
    await tick(10);

    expect(gotSignal?.aborted).toBe(true);
    expect(resource.loading()).toBe(false);
    expect(resource.error()).toBeNull();
  });

  it("default fetcher without using signal still resolves (compat)", async () => {
    let resolveFetcher: ((v: string) => void) | undefined;
    const resource = createResource(
      () =>
        new Promise<string>((resolve) => {
          resolveFetcher = resolve;
        }),
    );

    expect(resource.loading()).toBe(true);
    resolveFetcher!("Success");
    await tick(5);
    expect(resource()).toBe("Success");
    expect(resource.error()).toBeNull();
  });

  it("createInflightDedupe shares one promise per key until settled", async () => {
    const inflight = createInflightDedupe();
    let runs = 0;
    let resolveRun: ((v: string) => void) | undefined;

    const run = () =>
      inflight("k", () => {
        runs++;
        return new Promise<string>((resolve) => {
          resolveRun = resolve;
        });
      });

    const a = run();
    const b = run();
    expect(a).toBe(b);
    expect(runs).toBe(1);

    resolveRun!("v");
    expect(await a).toBe("v");
    expect(await b).toBe("v");

    const c = run();
    expect(runs).toBe(2);
    resolveRun!("v2");
    expect(await c).toBe("v2");
  });
});

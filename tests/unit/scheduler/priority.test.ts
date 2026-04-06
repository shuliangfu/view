import { describe, expect, it } from "@dreamer/test";
import { Priority, scheduleTask } from "@dreamer/view";

describe("scheduler/priority", () => {
  it("Immediate 优先级：应当同步执行", () => {
    let executed = false;
    scheduleTask(() => {
      executed = true;
    }, Priority.Immediate);
    expect(executed).toBe(true);
  });

  it("UserBlocking 应先于 Normal（同一微任务内按优先级排空）", async () => {
    const results: string[] = [];
    scheduleTask(() => results.push("Normal"), Priority.Normal);
    scheduleTask(() => results.push("UserBlocking"), Priority.UserBlocking);
    await Promise.resolve();
    expect(results).toEqual(["UserBlocking", "Normal"]);
  });

  it("Idle 应在 UserBlocking/Normal 之后执行", async () => {
    const results: string[] = [];
    scheduleTask(() => results.push("Idle"), Priority.Idle);
    scheduleTask(() => results.push("N"), Priority.Normal);
    await Promise.resolve();
    expect(results).toEqual(["N"]);
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    expect(results).toEqual(["N", "Idle"]);
  });
});

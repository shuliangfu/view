import { describe, expect, it } from "@dreamer/test";
import { createContext, runWithOwner, useContext } from "@dreamer/view";

describe("reactivity/context", () => {
  it("基础上下文共享", () => {
    const MyContext = createContext("default");

    // 默认值
    expect(useContext(MyContext)).toBe("default");

    // Provider 覆盖
    const owner: any = { owner: null, disposables: null, children: null };
    runWithOwner(owner, () => {
      MyContext.Provider({
        value: "overridden",
        children: () => {
          expect(useContext(MyContext)).toBe("overridden");
        },
      });
    });
  });

  it("嵌套上下文", () => {
    const MyContext = createContext(0);

    const root: any = { owner: null, disposables: null, children: null };
    runWithOwner(root, () => {
      MyContext.Provider({
        value: 1,
        children: () => {
          expect(useContext(MyContext)).toBe(1);

          MyContext.Provider({
            value: 2,
            children: () => {
              expect(useContext(MyContext)).toBe(2);
            },
          });
          // 退出内层后恢复外层
          expect(useContext(MyContext)).toBe(1);
        },
      });
    });
  });
});

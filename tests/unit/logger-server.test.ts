/**
 * @fileoverview server/utils/logger：setLoggerConfig 后 logger 代理可用。
 */

import { describe, expect, it } from "@dreamer/test";
import { logger, setLoggerConfig } from "../../src/server/utils/logger.ts";

describe("server logger", () => {
  it("默认 logger 应暴露 info 等方法", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("setLoggerConfig(null) 后仍应有有效 logger", () => {
    setLoggerConfig(null);
    expect(typeof logger.info).toBe("function");
    setLoggerConfig(undefined);
    expect(typeof logger.info).toBe("function");
  });

  it("setLoggerConfig 传入 level 应不抛错", () => {
    setLoggerConfig({ level: "debug" });
    expect(typeof logger.debug).toBe("function");
  });
});

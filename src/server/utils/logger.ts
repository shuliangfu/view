/**
 * View Server 统一日志
 *
 * 使用 @dreamer/logger 创建，供 server 下所有模块使用，替代直接 console 输出。
 * 可通过 setLoggerConfig(config) 应用 view.config 中的 logger 配置，需在加载配置后调用（如 App 初始化时）。
 *
 * @module @dreamer/view/server/utils/logger
 */

import { createLogger } from "@dreamer/logger";
import type { Logger } from "@dreamer/logger";
import type { AppLoggerConfig } from "../types.ts";

/** 默认 Server logger 配置：文本格式、控制台输出、info 级别 */
const DEFAULT_SERVER_LOGGER_CONFIG = {
  level: "info" as const,
  format: "text" as const,
  output: { console: true },
};

/** 当前 logger 实例（可被 setLoggerConfig 更新） */
let _logger: Logger = createLogger(DEFAULT_SERVER_LOGGER_CONFIG);

/**
 * 应用 AppConfig.logger 配置，更新 Server 统一 logger。
 * 在加载 view.config 后调用（如 App._initialize 末尾），未传或空对象时使用默认配置。
 *
 * @param config - view.config 中的 logger 配置，与 AppLoggerConfig 一致
 */
export function setLoggerConfig(config?: AppLoggerConfig | null): void {
  _logger = createLogger({
    ...DEFAULT_SERVER_LOGGER_CONFIG,
    ...(config && typeof config === "object" ? config : {}),
  });
}

/**
 * View Server 统一 logger 实例。
 * 导出为对当前 _logger 的引用，调用 setLoggerConfig 后所有使用处自动生效。
 */
export const logger: Logger = new Proxy({} as Logger, {
  get(_, prop: string) {
    return (_logger as unknown as Record<string, unknown>)[prop];
  },
});

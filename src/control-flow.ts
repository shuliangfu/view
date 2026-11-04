/**
 * @module control-flow
 * @description 控制流子路径：`jsr:@dreamer/view/control-flow`。
 *
 * Show / For / Index / Switch / Match / ErrorBoundary / Portal 等；
 * 不含 router / form。主入口（3.0 核心 barrel）仍 re-export 相同控制流符号。
 */

export {
  ErrorBoundary,
  For,
  Index,
  Match,
  Portal,
  Show,
  Switch,
} from "./runtime/control-flow.ts";

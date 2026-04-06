/**
 * 自定义 Hooks 统一导出
 * 便于从 @/hooks 或 ./hooks 使用
 */

export { useRouter } from "../router/router.ts";
export { theme, toggleTheme } from "./theme.ts";
export {
  incrementLoginCount,
  loginUser,
  logoutUser,
  setUserName,
} from "./user.ts";

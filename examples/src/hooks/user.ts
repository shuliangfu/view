/**
 * @module hooks/user
 * @description 对 `userStore` 的写操作与流程封装；读展示在视图里直接用 `userStore.xxx` 即可。
 */
import { type UserState, userStore } from "../stores/user.ts";

/**
 * 模拟登录：写入身份、最近登录时间，并累计登录次数。
 */
export function loginUser(name: string, role: UserState["role"] = "user") {
  userStore.name = name;
  userStore.role = role;
  userStore.lastLogin = new Date().toLocaleTimeString();
  userStore.loginCount++;
}

/**
 * 登出为访客：不重置 loginCount（与原先示例行为一致）。
 */
export function logoutUser() {
  userStore.name = "Guest";
  userStore.role = "guest";
  userStore.lastLogin = null;
}

/** 仅改昵称 */
export function setUserName(name: string) {
  userStore.name = name;
}

/** 手动 +1 登录次数（演示持久化计数） */
export function incrementLoginCount() {
  userStore.loginCount++;
}

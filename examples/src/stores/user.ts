/**
 * @module stores/user
 * @description 用户持久化状态：仅数据 + persist。改状态请用 `hooks/user.ts`。
 */
import { createStore } from "@dreamer/view";

/** 与 Store 示例页「清除持久化」共用，勿与其它示例冲突 */
export const USER_STORE_PERSIST_KEY = "view-examples-user";

/** 用户信息接口 */
export interface UserState {
  name: string;
  role: "guest" | "user" | "admin";
  loginCount: number;
  lastLogin: string | null;
}

/** 纯状态单例；业务方法见 hooks */
export const userStore = createStore(
  "examples-user-store",
  {
    name: "Guest",
    role: "guest",
    loginCount: 0,
    lastLogin: null,
  } as UserState,
  {
    /** localStorage 键名，与 Store 示例页「清除持久化」一致 */
    key: USER_STORE_PERSIST_KEY,
    /** 存储后端；省略时框架在浏览器里也会默认用 localStorage，此处写全便于对照文档 */
    storage: globalThis.localStorage,
    /** 持久化前序列化（默认行为等价于 JSON.stringify） */
    serialize: (state: UserState) => JSON.stringify(state),
    /** 恢复时反序列化（默认行为等价于 JSON.parse） */
    deserialize: (str: string) => JSON.parse(str) as UserState,
  },
);

/** @dreamer/view/compiler — 类型声明（compiler 依赖 TypeScript 运行时，此处仅声明对外 API） */
export type OnLoadArgs = { path: string; namespace?: string };
export function optimize(code: string, fileName?: string): string;
export function createOptimizePlugin(
  filter?: RegExp,
  readFile?: (path: string) => Promise<string>,
): { name: string; setup: (build: unknown) => void };

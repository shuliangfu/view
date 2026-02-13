/**
 * build 命令：编译构建，esbuild 打包 src/main.tsx → dist/main.js
 * 通过 deno task bundle 执行，与 deno.json 中 bundle 配置一致。
 */

/**
 * 执行构建
 * @param root 项目根目录（examples）
 * @returns 进程退出码，0 为成功
 */
export async function run(root: string): Promise<number> {
  const p = new Deno.Command("deno", {
    args: ["task", "bundle"],
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await p.spawn().status;
  return status.code;
}

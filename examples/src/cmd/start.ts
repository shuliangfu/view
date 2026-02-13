/**
 * start 命令：启动生产静态服务（server.ts）
 * 需先执行 build，再运行本命令以提供 dist/ 与 index.html。
 */

/**
 * 启动静态服务，阻塞直到进程退出
 * @param root 项目根目录（examples）
 * @returns 进程退出码
 */
export async function run(root: string): Promise<number> {
  const p = new Deno.Command("deno", {
    args: ["run", "-A", "server.ts"],
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await p.spawn().status;
  return status.code;
}

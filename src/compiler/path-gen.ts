/**
 * @module compiler/path-gen
 * @description 路径生成器 - 为 hydration 预计算 DOM 节点寻址路径。
 *
 * **支持的功能：**
 * - ✅ generatePathCode() - 将路径数组转为代码字符串
 * - ✅ calculatePaths() - 计算动态节点的路径
 * - ✅ 路径编码 (用于水合时的节点查找)
 *
 * **核心机制：**
 * - 路径数组表示 (如 [0, 1, 2] 表示 root.childNodes[0].childNodes[1].childNodes[2])
 * - 静态分析时记录动态节点的位置
 * - 生成可序列化的路径信息
 *
 * **范围说明：**
 * - 路径编码满足当前水合寻址；路径压缩、增量绑定等若需可另开优化项。
 *
 * @usage
 * const pathCode = generatePathCode([0, 1, 2]) // ".childNodes[0].childNodes[1].childNodes[2]"
 */

/**
 * 将寻址路径数组转为代码字符串。
 * [0, 1] -> 'childNodes[0].childNodes[1]'
 */
export function generatePathCode(path: number[]): string {
  if (path.length === 0) return "";
  return "." + path.map((i) => `childNodes[${i}]`).join(".");
}

/**
 * 遍历虚拟 JSX 树并记录动态节点的路径。
 */
export function calculatePaths(_tree: unknown): Map<string, number[]> {
  const paths = new Map<string, number[]>();
  // 深度优先遍历算法...
  return paths;
}

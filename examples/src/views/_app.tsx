/**
 * @dreamer/view 根组件示例
 */
import { useRouter } from "../router/router.ts";

export function App() {
  const router = useRouter();

  return (
    <div className="app-main">
      {/* 现代架构下 router.render() 直接返回真实 DOM 节点或片段 */}
      {router.render()}
    </div>
  );
}

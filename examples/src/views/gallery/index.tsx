/**
 * @module views/gallery
 * @description 展示 @dreamer/view 处理复杂交互、缩放、拖拽与样式的能力。
 */
import { createMemo, createSignal, For, Show } from "@dreamer/view";

interface ImageInfo {
  id: number;
  url: string;
  title: string;
  desc: string;
}

export default function GalleryDemo() {
  const images: ImageInfo[] = [
    {
      id: 1,
      url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
      title: "宁静峡谷",
      desc: "大自然的壮丽景观。",
    },
    {
      id: 2,
      url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05",
      title: "晨雾森林",
      desc: "清晨阳光穿透迷雾。",
    },
    {
      id: 3,
      url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e",
      title: "翠绿之径",
      desc: "漫步在绿意盎然的森林。",
    },
  ];

  const [selectedIndex, setSelectedIndex] = createSignal<number | null>(null);
  const [scale, setScale] = createSignal(1);
  const [position, setPosition] = createSignal({ x: 0, y: 0 });

  const selectedImage = createMemo(() => {
    const idx = selectedIndex();
    return idx !== null ? images.find((img) => img.id === idx) : null;
  });

  const previewStyle = createMemo(() => {
    const s = scale();
    const p = position();
    return {
      transform: `translate(${p.x}px, ${p.y}px) scale(${s})`,
      transition: isDragging() ? "none" : "transform 0.3s ease-out",
    };
  });

  const [isDragging, setIsDragging] = createSignal(false);
  let dragStart = { x: 0, y: 0 };

  const onMouseDown = (e: MouseEvent) => {
    if (selectedIndex() === null) return;
    setIsDragging(true);
    dragStart = { x: e.clientX - position().x, y: e.clientY - position().y };
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging()) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const onMouseUp = () => setIsDragging(false);

  return (
    <section
      className="space-y-12"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          交互画廊
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium">
          展示极致的样式转换、拖拽交互与响应式预览。
        </p>
      </header>

      {/* 缩略图列表 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <For each={() => images}>
          {(img: { id: number; url: string; title: string; desc: string }) => (
            <div
              onClick={() => {
                setSelectedIndex(img.id);
                setScale(1);
                setPosition({ x: 0, y: 0 });
              }}
              className="group cursor-pointer overflow-hidden rounded-3xl border-4 border-white dark:border-slate-800 hover:border-indigo-600 dark:hover:border-indigo-500 transition-all shadow-xl hover:shadow-2xl bg-white dark:bg-slate-800"
            >
              <div className="aspect-video overflow-hidden">
                <img
                  src={img.url}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
              </div>
              <div className="p-6">
                <h4 className="font-black text-slate-800 dark:text-slate-100 mb-1">
                  {img.title}
                </h4>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  {img.desc}
                </p>
              </div>
            </div>
          )}
        </For>
      </div>

      {/* 预览遮罩层 (Portal) */}
      <Show when={selectedIndex}>
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in">
          <button
            type="button"
            onClick={() => setSelectedIndex(null)}
            className="absolute top-8 right-8 text-white text-3xl hover:rotate-90 transition-transform"
          >
            ✕
          </button>

          <div className="flex flex-col items-center gap-6">
            <div
              className="cursor-grab active:cursor-grabbing select-none"
              onMouseDown={onMouseDown}
            >
              <img
                src={() => selectedImage()?.url ?? ""}
                style={previewStyle}
                className="max-w-4xl max-h-[70vh] rounded-xl shadow-2xl pointer-events-none"
              />
            </div>

            <div className="flex items-center gap-6 bg-white/10 p-4 rounded-full backdrop-blur-xl border border-white/20">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
                className="text-white text-xl hover:scale-125 transition-all"
              >
                －
              </button>
              <span className="text-white font-mono min-w-[6ch] text-center">
                {() => Math.round(scale() * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(3, s + 0.2))}
                className="text-white text-xl hover:scale-125 transition-all"
              >
                ＋
              </button>
            </div>
          </div>
        </div>
      </Show>
    </section>
  );
}

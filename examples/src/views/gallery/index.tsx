/**
 * 相册页面
 * 路由: /gallery
 * 展示 src/assets/images 下的图片，使用 @dreamer/image/client 的 extractInfo 显示信息；
 * 预览支持放大、缩小、拖拽平移（无独立 API，本页内实现）。
 */

import { createEffect, createMemo, createSignal } from "@dreamer/view";
import type { VNode } from "@dreamer/view";
import { extractInfo } from "@dreamer/image/client";
import type { ImageInfo } from "@dreamer/image/client";

/** 最小缩放比例 */
const MIN_SCALE = 0.25;
/** 最大缩放比例 */
const MAX_SCALE = 4;
/** 缩放步进 */
const SCALE_STEP = 0.25;

export const metadata = {
  title: "相册",
  description: "来自 assets/images 的测试图片展示",
  keywords: "相册, 图片, gallery, images",
  group: "示例",
};

/**
 * 相册图片列表（与 src/assets/images 下的文件名对应）
 * 开发/生产：static 插件从 src/assets 提供，路径为 /images/xxx
 */
const GALLERY_IMAGES = [
  { src: "/images/0.png", alt: "图片 0", title: "风景 0" },
  { src: "/images/1.jpg", alt: "图片 1", title: "风景 1" },
  { src: "/images/2.jpeg", alt: "图片 2", title: "风景 2" },
  { src: "/images/3.jpeg", alt: "图片 3", title: "风景 3" },
  { src: "/images/4.jpg", alt: "图片 4", title: "风景 4" },
  { src: "/images/5.jpeg", alt: "图片 5", title: "风景 5" },
  { src: "/images/6.jpeg", alt: "图片 6", title: "风景 6" },
];

/**
 * 格式化文件大小（字节 → 可读字符串）
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 拖拽起始数据（用于 mousemove 计算偏移） */
interface DragStart {
  x: number;
  y: number;
  posX: number;
  posY: number;
}

export default function Gallery(): VNode {
  /** 当前预览的图片索引，null 表示关闭预览 */
  const selectedIndex = createSignal<number | null>(null);
  /** extractInfo 解析结果，供底部信息栏展示 */
  const imageInfo = createSignal<ImageInfo | null>(null);
  const scale = createSignal(1);
  const position = createSignal({ x: 0, y: 0 });
  let dragStartRef: DragStart | null = null;
  /** 刚结束拖动时置 true，遮罩 onClick 不关闭；下一 tick 置回 false，避免误关后再次点击无法关闭 */
  let justFinishedDragRef = false;

  // 当选中图片变化时，用 @dreamer/image/client 的 extractInfo 获取尺寸、格式、大小
  createEffect(() => {
    const idx = selectedIndex.value;
    if (idx === null) {
      imageInfo.value = null;
      return;
    }
    const src = GALLERY_IMAGES[idx].src;
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((ab) => extractInfo(ab))
      .then((info) => {
        imageInfo.value = info;
      })
      .catch(() => (imageInfo.value = null));
  });

  // 切换图片时重置缩放与位移
  createEffect(() => {
    if (selectedIndex.value !== null) {
      scale.value = 1;
      position.value = { x: 0, y: 0 };
    }
  });

  /**
   * 预览图容器的 transform：用 createMemo + `style={previewWrapStyle}`。
   * compileSource 已对动态 style 生成 createEffect（见 jsx-compiler transform），与手写 runtime 的 bindIntrinsicReactiveDomProps 对齐；
   * 勿再依赖 querySelector/getDocument（易与真实挂载文档不一致）。
   */
  const previewWrapStyle = createMemo(() => {
    const pos = position.value;
    const scl = scale.value;
    return {
      transform: `translate(${pos.x}px, ${pos.y}px) scale(${scl})`,
      transformOrigin: "center center",
    };
  });

  const zoomIn =
    () => (scale.value = (s) => Math.min(MAX_SCALE, s + SCALE_STEP));
  const zoomOut =
    () => (scale.value = (s) => Math.max(MIN_SCALE, s - SCALE_STEP));
  const resetZoom = () => {
    scale.value = 1;
    position.value = { x: 0, y: 0 };
  };

  /** 仅在图片上按下时开始拖拽，图片外不触发移动 */
  const handleImageMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = position.value;
    dragStartRef = {
      x: e.clientX,
      y: e.clientY,
      posX: pos.x,
      posY: pos.y,
    };
    const onMove = (e2: MouseEvent) => {
      if (!dragStartRef) return;
      position.value = {
        x: dragStartRef.posX + (e2.clientX - dragStartRef.x),
        y: dragStartRef.posY + (e2.clientY - dragStartRef.y),
      };
    };
    const onUp = () => {
      if (dragStartRef !== null) {
        justFinishedDragRef = true;
        globalThis.setTimeout(() => {
          justFinishedDragRef = false;
        }, 0);
      }
      dragStartRef = null;
      globalThis.removeEventListener("mousemove", onMove);
      globalThis.removeEventListener("mouseup", onUp);
    };
    globalThis.addEventListener("mousemove", onMove);
    globalThis.addEventListener("mouseup", onUp);
  };

  const handleViewerWheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
    scale.value = (s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + delta));
  };

  /**
   * 大图预览中的图片区域：读 selectedIndex；平移/缩放由 previewWrapStyle（createMemo）驱动。
   */
  function previewImageContent(): VNode | null {
    const idx = selectedIndex.value;
    if (idx === null) return null;
    const img = GALLERY_IMAGES[idx];
    return (
      <div
        data-gallery-image-wrap
        className="flex items-center justify-center cursor-grab active:cursor-grabbing"
        style={previewWrapStyle}
        onMouseDown={handleImageMouseDown}
      >
        <img
          src={img.src}
          alt={img.alt}
          className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain shadow-2xl select-none pointer-events-none"
          draggable={false}
        />
      </div>
    );
  }

  /**
   * 预览底部尺寸/格式信息栏：单次读取 imageInfo，避免多段 insertReactive 在清空瞬间仍访问字段。
   */
  function previewImageInfoFooter(): VNode | null {
    const info = imageInfo.value;
    if (!info) return null;
    return (
      <div
        className="shrink-0 border-t border-white/10 px-4 py-2 text-center text-sm text-white/90"
        onClick={(e: Event) => e.stopPropagation()}
      >
        {`${info.width} × ${info.height} · ${info.format.toUpperCase()} · ${
          formatSize(info.size)
        }`}
      </div>
    );
  }

  return (
    <div className="py-8">
      {/* 页面标题区 */}
      <header className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          图片相册
        </h1>
        <p className="text-lg text-slate-500 dark:text-slate-400">
          来自 assets/images 的测试图片展示
        </p>
      </header>

      {/* 相册网格 */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {GALLERY_IMAGES.map((img, index) => (
          <article
            key={img.src}
            className="group overflow-hidden rounded-2xl bg-white shadow-md transition-all duration-300 hover:shadow-xl hover:-translate-y-1 dark:bg-slate-800"
          >
            <button
              type="button"
              className="block w-full aspect-4/3 overflow-hidden bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-slate-700"
              onClick={() => (selectedIndex.value = index)}
            >
              <img
                src={img.src}
                alt={img.alt}
                title={img.title}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </button>
            <div className="p-4">
              <h3 className="font-medium text-slate-800 truncate dark:text-slate-200">
                {img.title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {img.alt}
              </p>
            </div>
          </article>
        ))}
      </div>

      {/* 大图预览弹层：手写 jsx-runtime 须包无参 getter；勿写 selectedIndex.value !== null && (…)，会在首屏快照成 false 后永不挂载 */}
      {() =>
        selectedIndex.value !== null
          ? (
            <div
              className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label="图片预览"
              onClick={() => {
                if (justFinishedDragRef) return;
                selectedIndex.value = null;
              }}
            >
              {/* 顶部：仅关闭按钮 */}
              <div
                className="flex shrink-0 justify-end px-4 py-3"
                onClick={(e: Event) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                  aria-label="关闭"
                  onClick={() => (selectedIndex.value = null)}
                >
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* 可缩放查看区域：滚轮在整块区域生效；拖拽仅在图片上生效；点击图片外关闭 */}
              <div
                className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden"
                onWheel={handleViewerWheel}
                onClick={(e: Event) => {
                  if (
                    (e.target as HTMLElement).closest(
                      "[data-gallery-image-wrap]",
                    )
                  ) {
                    e.stopPropagation();
                  }
                }}
              >
                {
                  /*
                   * 大图由 previewImageContent() 提供；style={previewWrapStyle}（createMemo），compileSource 会生成响应式 style effect。
                   */
                }
                {previewImageContent()}
              </div>

              {/* 图片下方：放大、缩小、1:1 与百分比，便于看见 */}
              <div
                className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 px-4 py-3"
                onClick={(e: Event) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25"
                  aria-label="缩小"
                  onClick={zoomOut}
                >
                  缩小
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25"
                  aria-label="放大"
                  onClick={zoomIn}
                >
                  放大
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25"
                  aria-label="重置 1:1"
                  onClick={resetZoom}
                >
                  1:1
                </button>
                <span className="ml-2 text-sm font-medium text-white/90">
                  {() => `${Math.round(scale.value * 100)}%`}
                </span>
              </div>

              {/* 底部信息栏：在 getter 内读 imageInfo，fetch 完成后才重算 */}
              {previewImageInfoFooter()}
            </div>
          )
          : (
            false
          )}
    </div>
  );
}

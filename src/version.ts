/**
 * view 版本号与 deno.json 配置读取
 *
 * 参考 @dreamer/dweb 的 version.ts：
 * - 从包根 deno.json 读取 version，供 init、setup 使用
 * - 版本缓存：JSR 远程运行时缓存到 ~/.dreamer/view/version.json，避免每次请求网络
 * - setup 安装成功、init 解析出版本后可写入缓存
 */

import {
  dirname,
  ensureDir,
  exists,
  getEnv,
  join,
  readFileSync,
  readTextFile,
  writeTextFile,
} from "@dreamer/runtime-adapter";

/** 无法读取 deno.json 时的默认 view 版本 */
export const FALLBACK_VIEW_VERSION = "1.0.0";

/**
 * 将 file: URL 转为本地路径（兼容 Unix / Windows）
 */
export function fromFileUrl(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "file:") return url;
  let p = decodeURIComponent(u.pathname);
  if (p.length >= 3 && /^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
  return p;
}

/** 当前模块所在目录（version.ts 在 src/） */
function getCurrentDir(): string {
  return dirname(fromFileUrl(import.meta.url));
}

/**
 * view 包根目录路径
 * version.ts 在 src/，故上一级为包根
 */
export function getPackageRoot(): string {
  return join(getCurrentDir(), "..");
}

/** 包根 deno.json 路径 */
function getDenoJsonPath(): string {
  return join(getPackageRoot(), "deno.json");
}

/**
 * 从 deno.json 同步读取 version 字段
 * 读取失败时返回 FALLBACK_VIEW_VERSION
 */
function readVersionFromDenoJson(): string {
  try {
    const path = getDenoJsonPath();
    const data = readFileSync(path);
    const text = new TextDecoder().decode(data);
    const json = JSON.parse(text) as { version?: string };
    return json.version ?? FALLBACK_VIEW_VERSION;
  } catch {
    return FALLBACK_VIEW_VERSION;
  }
}

/**
 * 框架版本号（构建时从 deno.json 读取，仅本地有效）
 * JSR 远程运行时请使用 getViewVersion()
 */
export const VIEW_VERSION: string = readVersionFromDenoJson();

/**
 * 从 view 包根 deno.json 读取的配置
 */
export interface ViewDenoConfig {
  version: string;
  imports: Record<string, string>;
}

/**
 * 是否从 JSR/远程 URL 运行（非本地 file:）
 */
function isRemoteRun(): boolean {
  try {
    const url = import.meta.url;
    return url.startsWith("http:") || url.startsWith("https:");
  } catch {
    return false;
  }
}

const VERSION_CACHE_FILENAME = "version.json";

/**
 * 版本缓存目录：Unix ~/.dreamer/view，Windows %USERPROFILE%\.dreamer\view
 */
function getVersionCacheDir(): string {
  const home = getEnv("HOME") ?? getEnv("USERPROFILE") ??
    getEnv("LOCALAPPDATA") ?? "";
  if (!home) return "";
  return join(home, ".dreamer", "view");
}

/**
 * 从缓存文件读取 view 版本号
 * @returns 版本号，缓存不存在或无效时返回 null
 */
export async function readVersionCache(): Promise<string | null> {
  try {
    const cacheDir = getVersionCacheDir();
    if (!cacheDir) return null;
    const path = join(cacheDir, VERSION_CACHE_FILENAME);
    if (!(await exists(path))) return null;
    const content = await readTextFile(path);
    const parsed = JSON.parse(content) as { version?: string };
    const v = parsed?.version;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * 将 view 版本号写入缓存
 * 供 setup（安装）成功后调用，init 解析出版本后也可写入
 */
export async function writeVersionCache(version: string): Promise<void> {
  try {
    const cacheDir = getVersionCacheDir();
    if (!cacheDir) return;
    await ensureDir(cacheDir);
    await writeTextFile(
      join(cacheDir, VERSION_CACHE_FILENAME),
      JSON.stringify({ version }, null, 2),
    );
  } catch {
    // 忽略写入失败（如权限不足）
  }
}

/**
 * 从 view 包根 deno.json 读取版本与 imports
 * - 本地：从文件系统读取
 * - JSR：fetch 包根 ../deno.json（setup.ts 在 src/，故相对 import.meta.url）
 */
export async function loadViewDenoJson(): Promise<ViewDenoConfig | null> {
  try {
    if (isRemoteRun()) {
      const denoJsonUrl = new URL("../deno.json", import.meta.url).href;
      const res = await fetch(denoJsonUrl);
      if (!res.ok) return null;
      const content = await res.text();
      const parsed = JSON.parse(content) as {
        version?: string;
        imports?: Record<string, string>;
      };
      return {
        version: parsed.version ?? FALLBACK_VIEW_VERSION,
        imports: parsed.imports ?? {},
      };
    }
    const root = getPackageRoot();
    const denoJsonPath = join(root, "deno.json");
    if (!(await exists(denoJsonPath))) return null;
    const content = await readTextFile(denoJsonPath);
    const parsed = JSON.parse(content) as {
      version?: string;
      imports?: Record<string, string>;
    };
    return {
      version: parsed.version ?? FALLBACK_VIEW_VERSION,
      imports: parsed.imports ?? {},
    };
  } catch {
    return null;
  }
}

// ---------- JSR meta.json 版本解析（与 @dreamer/dweb jsr-versions 对齐） ----------

const JSR_VIEW_META_URL = "https://jsr.io/@dreamer/view/meta.json";

/** 是否为预发布版（含 -beta、-alpha、-rc 等） */
function isPrereleaseVersion(v: string): boolean {
  const normalized = v.replace(/^v/, "").trim();
  return /-\w+\.?\d*$/.test(normalized);
}

/** 解析 prerelease 标识中的数值（如 beta.17 -> 17），用于正确排序 */
function parsePrereleaseNum(pre: string): number {
  const m = pre.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * 简单 semver 比较：返回 a > b 则正数，a < b 则负数，相等则 0
 * 与 dweb 的 compareVersions 一致：major.minor.patch 先比，再比 prerelease 数值，稳定版视为大于 prerelease
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): [number, number, number, string] => {
    const normalized = v.replace(/^v/, "").trim();
    const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    if (!match) return [0, 0, 0, ""];
    return [
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10),
      (match[4] ?? "") as string,
    ];
  };
  const [ma, na, pa, preA] = parse(a);
  const [mb, nb, pb, preB] = parse(b);
  if (ma !== mb) return ma - mb;
  if (na !== nb) return na - nb;
  if (pa !== pb) return pa - pb;
  const aStable = preA === "";
  const bStable = preB === "";
  if (aStable && !bStable) return 1;
  if (!aStable && bStable) return -1;
  const preNumA = parsePrereleaseNum(preA);
  const preNumB = parsePrereleaseNum(preB);
  if (preNumA !== preNumB) return preNumA - preNumB;
  return String(preA).localeCompare(String(preB));
}

/**
 * 取两者中较新版本（用于 --beta：若稳定版高于 beta 则用稳定版）
 */
export function pickNewer(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return compareVersions(a, b) >= 0 ? a : b;
}

/**
 * 从 JSR meta.json 拉取可用版本并按 beta/稳定版规则选取
 * @param useBeta true 时允许 beta；若稳定版比 beta 新则仍返回稳定版
 */
async function fetchViewVersionFromJsr(useBeta: boolean): Promise<string> {
  const v = await fetchLatestViewVersionFromJsr(useBeta);
  return v ?? FALLBACK_VIEW_VERSION;
}

/**
 * 从 JSR meta.json 拉取 @dreamer/view 最新版本（供 upgrade 命令使用）
 * 成功时返回版本号，失败或无可用版本时返回 null
 * @param useBeta true 时允许 beta；若稳定版比 beta 新则仍返回稳定版
 */
/** 请求 JSR 时使用的 User-Agent，避免被当作浏览器返回 HTML */
const JSR_FETCH_UA = "view-cli/1.0 (jsr:@dreamer/view)";

export async function fetchLatestViewVersionFromJsr(
  useBeta: boolean,
): Promise<string | null> {
  try {
    // JSR 要求：Accept 不能含 text/html，且建议带 User-Agent 标识为 CLI
    const res = await fetch(JSR_VIEW_META_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": JSR_FETCH_UA,
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("Content-Type") ?? "";
    if (ct.includes("text/html")) return null;
    const meta = (await res.json()) as {
      latest?: string;
      versions?: Record<string, { yanked?: boolean }>;
    };
    const versions = meta.versions ?? {};
    const candidates = Object.entries(versions)
      .filter(([, m]) => !m.yanked)
      .map(([v]) => v);
    if (candidates.length === 0) return meta.latest ?? null;

    if (!useBeta) {
      if (meta.latest && candidates.includes(meta.latest)) return meta.latest;
      const stableList = candidates.filter((v) => !isPrereleaseVersion(v));
      if (stableList.length === 0) return null;
      stableList.sort((a, b) => compareVersions(b, a));
      return stableList[0] ?? null;
    }

    const latestStable = candidates
      .filter((v) => !isPrereleaseVersion(v))
      .sort((a, b) => compareVersions(b, a))[0] ?? null;
    const latestAny = candidates.sort((a, b) => compareVersions(b, a))[0] ??
      null;
    return pickNewer(latestStable, latestAny) ?? null;
  } catch {
    return null;
  }
}

/**
 * 获取 view 框架版本号（供 init、CLI 使用）
 *
 * - 本地运行：从 deno.json 读取
 * - JSR 远程：useBeta=false 时先读缓存，无缓存再请求 JSR 并写入缓存；
 *             useBeta=true 时请求 JSR，按「稳定版高于 beta 则用稳定版」规则，解析后写入缓存
 */
export async function getViewVersion(useBeta: boolean): Promise<string> {
  if (!isRemoteRun()) {
    const config = await loadViewDenoJson();
    return config?.version ?? FALLBACK_VIEW_VERSION;
  }

  if (!useBeta) {
    const cached = await readVersionCache();
    if (cached) return cached;
  }

  const version = await fetchViewVersionFromJsr(useBeta);
  if (version) {
    await writeVersionCache(version);
  }
  return version;
}

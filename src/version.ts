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
  const home =
    getEnv("HOME") ?? getEnv("USERPROFILE") ?? getEnv("LOCALAPPDATA") ?? "";
  if (!home) return "";
  return join(home, ".dreamer", "view");
}

function getVersionCachePath(): string {
  return join(getVersionCacheDir(), VERSION_CACHE_FILENAME);
}

/**
 * 从缓存文件读取 view 版本号
 * @returns 版本号，缓存不存在或无效时返回 null
 */
export async function readVersionCache(): Promise<string | null> {
  try {
    const cacheDir = getVersionCacheDir();
    if (!cacheDir) return null;
    const path = getVersionCachePath();
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
    const path = getVersionCachePath();
    await writeTextFile(path, JSON.stringify({ version }, null, 2));
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
      const parsed = JSON.parse(content) as { version?: string; imports?: Record<string, string> };
      return {
        version: parsed.version ?? FALLBACK_VIEW_VERSION,
        imports: parsed.imports ?? {},
      };
    }
    const root = getPackageRoot();
    const denoJsonPath = join(root, "deno.json");
    if (!(await exists(denoJsonPath))) return null;
    const content = await readTextFile(denoJsonPath);
    const parsed = JSON.parse(content) as { version?: string; imports?: Record<string, string> };
    return {
      version: parsed.version ?? FALLBACK_VIEW_VERSION,
      imports: parsed.imports ?? {},
    };
  } catch {
    return null;
  }
}

// ---------- JSR meta.json 版本解析（供 getViewVersion 使用） ----------

const JSR_VIEW_META_URL = "https://jsr.io/@dreamer/view/meta.json";

/** 是否为正则的稳定版（无 prerelease 后缀） */
function isStableVersion(v: string): boolean {
  const normalized = v.replace(/^v/, "");
  return /^\d+\.\d+\.\d+$/.test(normalized) || !normalized.includes("-");
}

/** 解析版本号为 [major, minor, patch] */
function parseVersionParts(v: string): number[] {
  const base = (v.replace(/^v/, "").split("-")[0] ?? "");
  const parts = base.split(".").map((s) => parseInt(s, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * 版本比较：>0 表示 a>b，<0 表示 a<b，0 表示相等
 * 若 major.minor.patch 相同，稳定版视为大于 prerelease
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  const aStable = isStableVersion(a);
  const bStable = isStableVersion(b);
  if (aStable && !bStable) return 1;
  if (!aStable && bStable) return -1;
  return 0;
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
  try {
    const res = await fetch(JSR_VIEW_META_URL);
    if (!res.ok) return FALLBACK_VIEW_VERSION;
    const meta = (await res.json()) as {
      versions?: Record<string, { yanked?: boolean }>;
    };
    const versions = meta.versions ?? {};
    const available = Object.entries(versions)
      .filter(([, m]) => !m.yanked)
      .map(([v]) => v);
    if (available.length === 0) return FALLBACK_VIEW_VERSION;

    const stableList = available.filter(isStableVersion);
    const latestStable =
      stableList.length > 0
        ? stableList.sort((a, b) => -compareVersions(a, b))[0]
        : null;

    if (!useBeta) {
      return latestStable ?? FALLBACK_VIEW_VERSION;
    }

    const latestAny = available.sort((a, b) => -compareVersions(a, b))[0];
    if (!latestStable) return latestAny ?? FALLBACK_VIEW_VERSION;
    return pickNewer(latestStable, latestAny) ?? FALLBACK_VIEW_VERSION;
  } catch {
    return FALLBACK_VIEW_VERSION;
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

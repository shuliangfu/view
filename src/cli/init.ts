/**
 * init 命令：按示例项目结构初始化新项目
 * 使用 @dreamer/runtime-adapter 做文件与路径操作，兼容 Deno / Bun。
 * 版本号通过 `server/utils/version.ts` 获取（支持缓存与 --beta：稳定版高于 beta 时仍用稳定版）。
 * 生成 views 下约定特殊文件 _app.tsx、_layout.tsx、_loading.tsx、_404.tsx、_error.tsx（路由扫描自动屏蔽）与路由页 home/about；`view.config` 与 `router/router.ts` 与 examples 对齐（单一 createRouter、正确 dev 扁平结构）。
 */

import { interactiveMenu } from "@dreamer/console";
import {
  cwd,
  ensureDir,
  existsSync,
  getEnv,
  join,
  readTextFile,
  relative,
  resolve,
  writeTextFile,
} from "@dreamer/runtime-adapter";
import { $tr, detectLocale } from "../i18n.ts";
import { logger } from "../server/utils/logger.ts";
import { getPluginsVersion, getViewVersion } from "../server/utils/version.ts";

/** 运行时：Deno 仅生成 deno.json；Bun 生成 package.json、.npmrc、tsconfig.json */
type Runtime = "deno" | "bun";

/** 样式方案：Tailwind / UnoCSS / 不需要 */
type Style = "tailwind" | "unocss" | "none";

/** ANSI green for success message */
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

/**
 * i18n-ally 自定义框架配置：识别 $t() / $tr()（view、dweb 等包通用），无注释
 */
function getI18nAllyCustomFrameworkYml(): string {
  return `monopoly: true∫

languageIds:
  - javascript
  - typescript
  - javascriptreact
  - typescriptreact

usageMatchRegex:
  - "[^\\\\w\\\\d]\\\\$t(?:r)?\\\\(['\\\"\`]({key})['\\\"\`]"
  - "[^\\\\w\\\\d]\\\\$t(?:r)?\\\\(['\\\"\`]({key})['\\\"\`]\\\\s*,"
  - "[^\\\\w\\\\d]\\\\$t(?:r)?\\\\(['\\\"\`]({key})['\\\"\`]\\\\s*,.*?['\\\"\`][a-z]{2}-[A-Z]{2}['\\\"\`]\\\\s*\\\\)"

refactorTemplates:
  - '$t("$1")'
  - '$tr("$1")'
`;
}

/**
 * 根据运行时生成 .vscode/settings.json：Deno 用 denoland.vscode-deno，Bun 用 vscode.typescript-language-features
 */
function getVscodeSettingsJson(runtime: Runtime): string {
  if (runtime === "bun") {
    return `{
  // ==================== ${$tr("init.template.vscodeBun")} ====================
  // ${$tr("init.template.vscodeFormat")}
  "[typescript]": {
    "editor.defaultFormatter": "vscode.typescript-language-features",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll": "explicit",
      "source.organizeImports": "explicit"
    }
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "vscode.typescript-language-features",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll": "explicit",
      "source.organizeImports": "explicit"
    }
  },
  "[javascript]": {
    "editor.defaultFormatter": "vscode.typescript-language-features",
    "editor.formatOnSave": true
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "vscode.typescript-language-features",
    "editor.formatOnSave": true
  },
  "[json]": {
    "editor.defaultFormatter": "vscode.json-language-features",
    "editor.formatOnSave": true
  },
  "[jsonc]": {
    "editor.defaultFormatter": "vscode.json-language-features",
    "editor.formatOnSave": true
  },
  // ==================== ${
      $tr("init.template.vscodeEditor")
    } ====================
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "editor.detectIndentation": false,
  "editor.trimAutoWhitespace": true,
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,
  "files.trimFinalNewlines": true,
  "editor.rulers": [120],
  "editor.wordWrap": "off",
  "editor.formatOnPaste": true,
  "editor.formatOnType": false,
  "editor.suggestSelection": "first",
  "editor.snippetSuggestions": "top",
  "editor.bracketPairColorization.enabled": true,
  "editor.guides.bracketPairs": false,
  "editor.minimap.enabled": true,
  // ==================== ${$tr("init.template.vscodeCss")} ====================
  "css.lint.unknownAtRules": "ignore",
  // ==================== ${
      $tr("init.template.vscodeAssoc")
    } ====================
  "files.associations": {
    "*.tsx": "typescriptreact",
    "*.ts": "typescript"
  },
  // ==================== ${
      $tr("init.template.vscodeExclude")
    } ====================
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
    "**/node_modules": true,
    "**/.bun": true
  },
  // ==================== ${
      $tr("init.template.vscodeSearchExclude")
    } ====================
  "search.exclude": {
    "**/node_modules": true,
    "**/.bun": true,
    "**/dist": true,
    "**/runtime": true
  },
  // ==================== ${
      $tr("init.template.vscodeI18n")
    } ====================
  "i18n-ally.localesPaths": ["src/locales"],
  "i18n-ally.pathMatcher": "{locale}.{ext}",
  "i18n-ally.keystyle": "nested",
  "i18n-ally.sortKeys": true,
  "i18n-ally.namespace": false,
  "i18n-ally.enabledParsers": ["json"],
  "i18n-ally.sourceLanguage": "zh-CN",
  "i18n-ally.displayLanguage": "zh-CN",
  "i18n-ally.translate.engines": ["deepl", "google"],
  "i18n-ally.extract.keygenStyle": "PascalCase",
  "i18n-ally.enabledFrameworks": ["react", "i18next", "general", "custom"],
  "i18n-ally.regex.key": ".*?",
  "i18n-ally.extract.autoDetect": true
}
`;
  }
  // Deno 运行时
  return `{
  // ==================== ${
    $tr("init.template.vscodeDeno")
  } ====================
  "deno.enable": true,
  "deno.lint": true,
  // ==================== ${
    $tr("init.template.vscodeFormat")
  } ====================
  "[typescript]": {
    "editor.defaultFormatter": "denoland.vscode-deno",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll": "explicit",
      "source.organizeImports": "explicit"
    }
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "denoland.vscode-deno",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll": "explicit",
      "source.organizeImports": "explicit"
    }
  },
  "[javascript]": {
    "editor.defaultFormatter": "denoland.vscode-deno",
    "editor.formatOnSave": true
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "denoland.vscode-deno",
    "editor.formatOnSave": true
  },
  "[json]": {
    "editor.defaultFormatter": "vscode.json-language-features",
    "editor.formatOnSave": true
  },
  "[jsonc]": {
    "editor.defaultFormatter": "vscode.json-language-features",
    "editor.formatOnSave": true
  },
  // ==================== ${
    $tr("init.template.vscodeEditor")
  } ====================
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "editor.detectIndentation": false,
  "editor.trimAutoWhitespace": true,
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,
  "files.trimFinalNewlines": true,
  "editor.rulers": [120],
  "editor.wordWrap": "off",
  "editor.formatOnPaste": true,
  "editor.formatOnType": false,
  "editor.suggestSelection": "first",
  "editor.snippetSuggestions": "top",
  "editor.bracketPairColorization.enabled": true,
  "editor.guides.bracketPairs": false,
  "editor.minimap.enabled": true,
  // ==================== ${$tr("init.template.vscodeCss")} ====================
  "css.lint.unknownAtRules": "ignore",
  // ==================== ${
    $tr("init.template.vscodeAssoc")
  } ====================
  "files.associations": {
    "*.tsx": "typescriptreact",
    "*.ts": "typescript"
  },
  // ==================== ${
    $tr("init.template.vscodeExclude")
  } ====================
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
    "**/node_modules": true,
    "**/.deno": true
  },
  // ==================== ${
    $tr("init.template.vscodeSearchExclude")
  } ====================
  "search.exclude": {
    "**/node_modules": true,
    "**/.deno": true,
    "**/dist": true,
    "**/runtime": true
  },
  // ==================== ${
    $tr("init.template.vscodeI18n")
  } ====================
  "i18n-ally.localesPaths": ["src/locales"],
  "i18n-ally.pathMatcher": "{locale}.{ext}",
  "i18n-ally.keystyle": "nested",
  "i18n-ally.sortKeys": true,
  "i18n-ally.namespace": false,
  "i18n-ally.enabledParsers": ["json"],
  "i18n-ally.sourceLanguage": "zh-CN",
  "i18n-ally.displayLanguage": "zh-CN",
  "i18n-ally.translate.engines": ["deepl", "google"],
  "i18n-ally.extract.keygenStyle": "PascalCase",
  "i18n-ally.enabledFrameworks": ["react", "i18next", "general", "custom"],
  "i18n-ally.regex.key": ".*?",
  "i18n-ally.extract.autoDetect": true
}
`;
}

/**
 * CLI 入口：由 @dreamer/console 的 action 调用
 * @param options options.dir 为可选目标目录（CLI：`view init [dir]` 第一个位置参数；未传则当前目录）；options.beta 为 true 时允许使用最新 beta（若稳定版更高则仍用稳定版）
 */
export async function main(
  options?: Record<string, unknown>,
): Promise<void> {
  const beta = options?.beta === true;
  const [VIEW_VERSION, PLUGINS_VERSION] = await Promise.all([
    getViewVersion(beta),
    getPluginsVersion(beta),
  ]);

  const root = cwd();
  const targetDirRaw = (options?.dir as string | undefined)?.trim() ?? ".";
  // 已是绝对路径时直接使用，避免 resolve(root, absPath) 在部分实现里被错误拼接
  const targetDir = targetDirRaw === "."
    ? root
    : targetDirRaw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(targetDirRaw)
    ? targetDirRaw
    : resolve(root, targetDirRaw);

  /** Display path: always relative to cwd (e.g. "app-test" or ".") */
  const displayDir = targetDir === root
    ? "."
    : relative(root, targetDir) || ".";
  /** Paths of all created files (relative to project), for final listing */
  const createdFiles: string[] = [];
  const addFile = (relPath: string) => createdFiles.push(relPath);

  // ---------------------------------------------------------------------------
  // 运行时选择：Deno 仅生成 deno.json；Bun 生成 package.json、.npmrc、tsconfig.json
  // options.runtime 存在时跳过交互（用于 CI/测试）
  // ---------------------------------------------------------------------------
  const runtimeOpt = options?.runtime as string | undefined;
  const runtime: Runtime = runtimeOpt === "bun"
    ? "bun"
    : runtimeOpt === "deno"
    ? "deno"
    : (await interactiveMenu(
        $tr("cli.init.runtime"),
        [$tr("cli.init.runtimeDeno"), $tr("cli.init.runtimeBun")],
        0,
      )) === 0
    ? "deno"
    : "bun";

  // ---------------------------------------------------------------------------
  // 样式选择：Tailwind / UnoCSS / 不需要；options.style 存在时跳过交互
  // ---------------------------------------------------------------------------
  const styleOpt = options?.style as string | undefined;
  const styleIdx =
    styleOpt === "tailwind" || styleOpt === "unocss" || styleOpt === "none"
      ? null
      : await interactiveMenu(
        $tr("cli.init.style"),
        [
          $tr("cli.init.styleTailwind"),
          $tr("cli.init.styleUnoCSS"),
          $tr("cli.init.styleNone"),
        ],
        0,
      );
  const style: Style = styleOpt === "tailwind"
    ? "tailwind"
    : styleOpt === "unocss"
    ? "unocss"
    : styleOpt === "none"
    ? "none"
    : styleIdx === 0
    ? "tailwind"
    : styleIdx === 1
    ? "unocss"
    : "none";

  // ---------------------------------------------------------------------------
  // 选择完毕后再创建项目目录与文件
  // ---------------------------------------------------------------------------
  await ensureDir(targetDir);
  await ensureDir(join(targetDir, "src"));
  await ensureDir(join(targetDir, "src", "assets"));
  await ensureDir(join(targetDir, "src", "router"));
  await ensureDir(join(targetDir, "src", "views"));
  await ensureDir(join(targetDir, "src", "stores"));
  await ensureDir(join(targetDir, "src", "hooks"));
  await ensureDir(join(targetDir, "src", "utils"));

  // ---------------------------------------------------------------------------
  // view.config.ts（根据样式方案生成：含 server、build、plugins；index.html 由 static 从 src/assets 提供）
  // ---------------------------------------------------------------------------
  const pluginsImports = style === "tailwind"
    ? `import { tailwindPlugin } from "@dreamer/plugins/tailwindcss";
import { staticPlugin } from "@dreamer/plugins/static";`
    : style === "unocss"
    ? `import { unocssPlugin } from "@dreamer/plugins/unocss";
import { staticPlugin } from "@dreamer/plugins/static";`
    : `import { staticPlugin } from "@dreamer/plugins/static";`;

  const buildAssetsBlock = style === "tailwind"
    ? `
    /** ${$tr("init.template.viewConfigAssetsComment")} */
    assets: {
      publicDir: "src/assets",
      assetsDir: "assets",
      exclude: ["tailwind.css", "index.css"],
      images: {
        compress: true,
        quality: 80,
        format: "avif",
        hash: true,
      },
    },`
    : style === "unocss"
    ? `
    /** ${$tr("init.template.viewConfigAssetsComment")} */
    assets: {
      publicDir: "src/assets",
      assetsDir: "assets",
      exclude: ["uno.css", "global.css", "index.css"],
      images: {
        compress: true,
        quality: 80,
        format: "avif",
        hash: true,
      },
    },`
    : "";

  /** 将 i18n 的 unocss content 说明格式化为多行 JSDoc，用于生成的 view.config.ts；缩进与 unocssPlugin 内部属性对齐 */
  const unocssContentComment = (() => {
    const raw = $tr("init.template.unocssContentComment") as string;
    const indent = "      "; /* 6 空格，与 output/cssEntry/content 等属性同级 */
    return indent + "/**\n" +
      raw.split("\n").map((l) => indent + " * " + l).join("\n") + "\n" +
      indent + " */";
  })();

  /** 静态资源插件配置：三处（tailwind / unocss / 无样式）共用，避免三元内重复 */
  const staticPluginBlock = `    staticPlugin({
      statics: [
        { root: "src/assets", prefix: "/*" },
        { root: "dist", prefix: "/*" },
      ],
    }),
  ]`;

  const pluginsArray = style === "tailwind"
    ? `[
    tailwindPlugin({
      output: "dist/assets",
      cssEntry: "src/assets/tailwind.css",
      assetsPath: "/assets",
    }),
${staticPluginBlock}`
    : style === "unocss"
    ? `[
    unocssPlugin({
      output: "dist/assets",
      cssEntry: "src/assets/uno.css",
      assetsPath: "/assets",
${unocssContentComment}
      content: [
        "./src/**/*.{ts,tsx}",
        "./src/**/*.html",
        "./src/assets/index.html",
      ],
    }),
${staticPluginBlock}`
    : `[
${staticPluginBlock}`;

  const appName = displayDir === "."
    ? "view-app"
    : (displayDir.split("/").pop() ?? "view-app").replace(/\s+/g, "-");
  /** 头部显示名：当前目录未指定项目名时显示 @dreamer/view，否则显示 appName */
  const headerTitle = appName === "view-app" ? "@dreamer/view" : appName;
  const appVersion = "0.0.1";
  const appLanguage = detectLocale();

  const viewConfigTs = `/**
 * ${$tr("init.template.viewConfigComment")}
 */
${pluginsImports}

const config = {
  name: "${appName}",
  version: "${appVersion}",
  language: "${appLanguage}",
  server: {
    port: 8787,
    host: "127.0.0.1",
    dev: {
      hmr: { enabled: true, path: "/__hmr" },
      watch: {
        paths: ["./src"],
        ignore: ["node_modules", ".git", "dist", "routers.tsx"],
      },
    },
    prod: { port: 8787, host: "127.0.0.1" },
  },
  build: {
    entry: "src/main.tsx",
    outDir: "dist",
    outFile: "main.js",
    minify: true,
    sourcemap: true,
    splitting: true,${buildAssetsBlock}
    /** ${$tr("init.template.viewConfigDevComment")} */
    dev: {
      minify: false,
      sourcemap: true,
    },
    /** ${$tr("init.template.viewConfigProdComment")} */
    prod: {
      minify: true,
      sourcemap: true,
    },
  },
  plugins: ${pluginsArray},
  /** ${$tr("init.template.viewConfigLoggerComment")} */
  logger: {
    /** ${$tr("init.template.loggerLevelComment")} */
    level: "info",
    /** ${$tr("init.template.loggerFormatComment")} */
    format: "text",
    /** ${$tr("init.template.loggerShowTimeComment")} */
    showTime: false,
    /** ${$tr("init.template.loggerShowLevelComment")} */
    showLevel: true,
    /** ${$tr("init.template.loggerColorComment")} */
    color: "auto",
    output: {
      /** ${$tr("init.template.loggerOutputConsoleComment")} */
      console: "auto",
      file: {
        /** ${$tr("init.template.loggerFilePathComment")} */
        path: "runtime/logs/app.log",
        /** ${$tr("init.template.loggerRotateComment")} */
        rotate: true,
        /** ${$tr("init.template.loggerMaxSizeComment")} */
        maxSize: 10 * 1024 * 1024,
        /** ${$tr("init.template.loggerMaxFilesComment")} */
        maxFiles: 5,
      },
    },
  },
};

export default config;
`;
  await writeTextFile(join(targetDir, "view.config.ts"), viewConfigTs);
  addFile("view.config.ts");

  // ---------------------------------------------------------------------------
  // deno.json（仅 Deno 运行时）或 package.json + .npmrc + tsconfig.json（Bun）
  // 含 @dreamer/plugins（static 插件提供 index.html 与静态资源）
  // ---------------------------------------------------------------------------
  if (runtime === "deno") {
    const imports: Record<string, string> = {
      "@dreamer/view": `jsr:@dreamer/view@^${VIEW_VERSION}`,
      "@dreamer/plugins": `jsr:@dreamer/plugins@^${PLUGINS_VERSION}`,
    };
    if (style === "tailwind") {
      imports["tailwindcss"] = "npm:tailwindcss@4.2.0";
    } else if (style === "unocss") {
      imports["@unocss/core"] = "npm:@unocss/core@66.0.0";
    }
    /** 项目名（与 appName 一致，用于 description / keywords） */
    const projectNameDeno = displayDir === "."
      ? "view-app"
      : (displayDir.split("/").pop() ?? "view-app").replace(/\s+/g, "-");
    /** 简短描述：项目名 + 说明，便于发布与识别 */
    const description =
      `${projectNameDeno} — SPA/SSR app scaffolded with @dreamer/view`;
    /** 作者：优先 USER（Unix），其次 USERNAME（Windows），无则留空由用户自填 */
    const author = getEnv("USER") ?? getEnv("USERNAME") ?? "";
    const denoJson = {
      version: "1.0.0",
      description,
      author,
      license: "MIT",
      keywords: [
        projectNameDeno,
        "view",
        "@dreamer/view",
        "dweb",
        "dreamer",
        "spa",
        "ssr",
        "react",
        "typescript",
      ],
      tasks: {
        dev: "deno run -A @dreamer/view/cli dev",
        build: "deno run -A @dreamer/view/cli build",
        start: "deno run -A @dreamer/view/cli start",
      },
      imports,
      nodeModulesDir: "auto",
      lint: {
        include: ["src/"],
        exclude: ["dist/"],
      },
      compilerOptions: {
        jsx: "react-jsx",
        jsxImportSource: "@dreamer/view",
        lib: ["deno.window", "dom"],
      },
    };
    await writeTextFile(
      join(targetDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );
    addFile("deno.json");
  } else {
    const projectName = displayDir === "."
      ? "view-app"
      : (displayDir.split("/").pop() ?? "view-app").replace(/\s+/g, "-");
    const dependencies: Record<string, string> = {
      "@dreamer/view": `npm:@jsr/dreamer__view@^${VIEW_VERSION}`,
      "@dreamer/plugins": `npm:@jsr/dreamer__plugins@^${PLUGINS_VERSION}`,
    };
    if (style === "tailwind") {
      dependencies["tailwindcss"] = "npm:tailwindcss@4.2.0";
    } else if (style === "unocss") {
      dependencies["@unocss/core"] = "npm:@unocss/core@66.0.0";
    }
    const packageJson = {
      name: projectName,
      version: "0.0.1",
      type: "module" as const,
      private: true,
      scripts: {
        dev: "bun run node_modules/@dreamer/view/src/cli.ts dev",
        build: "bun run node_modules/@dreamer/view/src/cli.ts build",
        start: "bun run node_modules/@dreamer/view/src/cli.ts start",
      },
      dependencies,
    };
    await writeTextFile(
      join(targetDir, "package.json"),
      JSON.stringify(packageJson, null, 2),
    );
    addFile("package.json");
    await writeTextFile(
      join(targetDir, ".npmrc"),
      "@jsr:registry=https://npm.jsr.io\n",
    );
    addFile(".npmrc");
    const tsconfigJson = {
      compilerOptions: {
        target: "ESNext",
        module: "NodeNext",
        moduleResolution: "nodenext",
        lib: ["ESNext", "DOM", "DOM.Iterable"],
        jsx: "react-jsx",
        jsxImportSource: "@dreamer/view",
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        resolveJsonModule: true,
        isolatedModules: true,
        allowImportingTsExtensions: true,
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist"],
    };
    await writeTextFile(
      join(targetDir, "tsconfig.json"),
      JSON.stringify(tsconfigJson, null, 2),
    );
    addFile("tsconfig.json");
  }

  // ---------------------------------------------------------------------------
  // .vscode/settings.json（按 Deno/Bun 生成）、.vscode/i18n-ally-custom-framework.yml
  // ---------------------------------------------------------------------------
  await ensureDir(join(targetDir, ".vscode"));
  await writeTextFile(
    join(targetDir, ".vscode", "settings.json"),
    getVscodeSettingsJson(runtime),
  );
  addFile(".vscode/settings.json");
  await writeTextFile(
    join(targetDir, ".vscode", "i18n-ally-custom-framework.yml"),
    getI18nAllyCustomFrameworkYml(),
  );
  addFile(".vscode/i18n-ally-custom-framework.yml");

  // ---------------------------------------------------------------------------
  // src/assets/index.html（模板：dark 首屏、data-view-cloak、/main.js；由 static 插件从 assets 提供）
  // body 渐变类按样式方案区分：Tailwind v4 用 bg-linear-to-b，UnoCSS 用 bg-gradient-to-b
  // ---------------------------------------------------------------------------
  const indexHtmlBodyClass = style === "tailwind"
    ? "min-h-screen bg-linear-to-b from-slate-50 to-slate-100 text-slate-800 antialiased dark:from-slate-900 dark:to-slate-800 dark:text-slate-200"
    : "min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800 antialiased dark:from-slate-900 dark:to-slate-800 dark:text-slate-200";
  const indexHtml = `<!DOCTYPE html>
<html lang="${$tr("init.template.htmlLang")}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>${$tr("init.template.htmlTitle")}</title>
    <!-- ${$tr("init.template.htmlDarkScriptComment")} -->
    <script>
      try {
        var v = localStorage.getItem("view-theme");
        var isDark = v === "dark" ||
          (v && JSON.parse(v).theme === "dark");
        if (isDark) document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
      } catch (_) {}
    </script>

    <style>
      [data-view-cloak] {
        display: none;
      }
    </style>
  </head>
  <body
    class="${indexHtmlBodyClass}"
  >
    <div id="root" data-view-cloak></div>
    <script type="module" src="/main.js"></script>
  </body>
</html>
`;
  await writeTextFile(
    join(targetDir, "src", "assets", "index.html"),
    indexHtml,
  );
  addFile("src/assets/index.html");

  // favicon.svg（与 index.html 中 link href 一致，由 static 插件提供）
  const faviconSvg = `<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 32 32"
  width="32"
  height="32"
>
  <rect width="32" height="32" rx="6" fill="#2563eb" />
  <text
    x="16"
    y="22"
    font-size="18"
    font-weight="bold"
    fill="white"
    text-anchor="middle"
    font-family="system-ui,sans-serif"
  >V</text>
</svg>
`;
  await writeTextFile(
    join(targetDir, "src", "assets", "favicon.svg"),
    faviconSvg,
  );
  addFile("src/assets/favicon.svg");

  // 占位全局样式；入口 main.tsx 已 import，与 examples 一致以拉通构建侧 CSS 处理
  await writeTextFile(
    join(targetDir, "src", "assets", "global.css"),
    `/** ${$tr("init.template.globalCssComment")} */\n`,
  );
  addFile("src/assets/global.css");
  await writeTextFile(
    join(targetDir, "src", "assets", "index.css"),
    `/** ${$tr("init.template.indexCssComment")} */\n`,
  );
  addFile("src/assets/index.css");

  // 按样式方案生成对应 CSS 入口（Tailwind / UnoCSS 由插件编译，main.tsx 或页面中 import）
  if (style === "tailwind") {
    const tailwindCss = `/**
 * ${$tr("init.template.tailwindCssComment")}
 */
@import "tailwindcss";
@source "../**/*.{ts,tsx}";
@custom-variant dark (&:where(.dark, .dark *));
`;
    await writeTextFile(
      join(targetDir, "src", "assets", "tailwind.css"),
      tailwindCss,
    );
    addFile("src/assets/tailwind.css");
  } else if (style === "unocss") {
    const unoCssHeader = ($tr("init.template.unoCssHeaderComment") as string)
      .split("\n")
      .map((l) => ` * ${l}`)
      .join("\n");
    const unoCss = `/**
${unoCssHeader}
 */

/* ${$tr("init.template.unoCssResetComment")} */
*, *::before, *::after {
  box-sizing: border-box;
}
html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
}
a {
  color: inherit;
  text-decoration: none;
}

/* ${$tr("init.template.unoCssBodyComment")} */
body {
  min-height: 100vh;
  background: linear-gradient(to bottom, #f8fafc, #f1f5f9);
  color: #1e293b;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.dark body {
  background: linear-gradient(to bottom, #0f172a, #1e293b);
  color: #e2e8f0;
}

/* ${$tr("init.template.unoCssCustomComment")} */
`;
    await writeTextFile(
      join(targetDir, "src", "assets", "uno.css"),
      unoCss,
    );
    addFile("src/assets/uno.css");
  }

  // ---------------------------------------------------------------------------
  // src/main.tsx
  // ---------------------------------------------------------------------------
  const mainTsx = `/**
 * ${$tr("init.template.mainComment")}
 */
import { createRouter, mountWithRouter } from "@dreamer/view";
import { notFoundRoute, routes } from "./router/routers.tsx";
import "./assets/global.css";

const router = createRouter({
  routes: [...routes],
  notFound: notFoundRoute,
});

mountWithRouter("#root", router);
`;
  await writeTextFile(join(targetDir, "src", "main.tsx"), mainTsx);
  addFile("src/main.tsx");

  // ---------------------------------------------------------------------------
  // src/views/_app.tsx（约定根组件，路由扫描自动屏蔽）
  // ---------------------------------------------------------------------------
  const appTsx = `/**
 * ${$tr("init.template.appComment")}
 * 可选根壳：若使用请在入口用 mount(fn, root) 包裹并与 main 中共用同一次 createRouter 的结果；默认入口为 mountWithRouter，本文件可删或按需接入。
 */
import { useRouter } from "../router/router.ts";

export function App() {
  const router = useRouter();

  return (
    <div className="app-container">
      {router.render()}
    </div>
  );
}
`;
  await writeTextFile(join(targetDir, "src", "views", "_app.tsx"), appTsx);
  addFile("src/views/_app.tsx");

  // ---------------------------------------------------------------------------
  // src/views/_layout.tsx（约定布局，路由扫描自动屏蔽）
  // ---------------------------------------------------------------------------
  const layoutTsx = `/**
 * ${$tr("init.template.layoutComment")}
 * 顶栏与 examples 对齐；主题前为「首页 / 关于」Link；主题图标为 SVG（深色太阳、浅色月亮）。
 */
import { Link, useRouter } from "@dreamer/view";
import { theme, toggleTheme } from "../stores/theme.ts";

/** 顶栏导航链接样式（当前路由高亮） */
function navLinkClass(active: boolean): string {
  return active
    ? "rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 shadow-sm dark:text-indigo-300 dark:bg-indigo-900/50"
    : "rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100";
}

/** 太阳图标（与 examples/_layout 一致） */
const SunIcon = () => (
  <svg
    className="h-5 w-5 text-slate-600 dark:text-slate-400"
    fill="currentColor"
    viewBox="0 0 20 20"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
      clipRule="evenodd"
    />
  </svg>
);

/** 月亮图标（与 examples/_layout 一致） */
const MoonIcon = () => (
  <svg
    className="h-5 w-5 shrink-0 fill-slate-600 dark:fill-slate-400"
    width={20}
    height={20}
    viewBox="0 0 20 20"
    aria-hidden="true"
  >
    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
  </svg>
);

export function Layout(props: { children: any }) {
  const router = useRouter();
  const isDark = () => theme() === "dark";

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-100 to-slate-200/90 transition-colors duration-300 dark:from-slate-900 dark:to-slate-800/80">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-800/80">
        <nav className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-slate-800 transition-colors hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400"
          >
            ${headerTitle}
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/"
              className={() =>
                navLinkClass(router.path() === "/") +
                " outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-slate-800"}
            >
              ${$tr("init.template.homeNavTitle")}
            </Link>
            <Link
              href="/about"
              className={() =>
                navLinkClass(router.path() === "/about") +
                " outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-slate-800"}
            >
              ${$tr("init.template.aboutTitle")}
            </Link>
            <button
              type="button"
              onClick={() => toggleTheme()}
              className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-slate-800"
              title="切换主题"
            >
              {() => (isDark() ? <SunIcon /> : <MoonIcon />)}
            </button>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {props.children}
      </main>
    </div>
  );
}

export default Layout;
`;
  await writeTextFile(
    join(targetDir, "src", "views", "_layout.tsx"),
    layoutTsx,
  );
  addFile("src/views/_layout.tsx");

  // ---------------------------------------------------------------------------
  // src/views/_loading.tsx（约定加载占位，路由扫描自动屏蔽）
  // ---------------------------------------------------------------------------
  const loadingTsx = `/**
 * ${$tr("init.template.loadingComment")}
 */
export default function RouteLoading() {
  return (
    <section className="flex min-h-50 items-center justify-center">
      <p>${$tr("init.template.loading")}</p>
    </section>
  );
}
`;
  await writeTextFile(
    join(targetDir, "src", "views", "_loading.tsx"),
    loadingTsx,
  );
  addFile("src/views/_loading.tsx");

  // ---------------------------------------------------------------------------
  // src/views/_404.tsx（约定 404 页，作为 path * 的 notFound 路由）
  // ---------------------------------------------------------------------------
  const notFoundTsxContent = `/**
 * ${$tr("init.template.notFoundComment")}
 */
export const metadata = {
  title: "404",
  description: ${JSON.stringify($tr("init.template.notFoundDesc"))},
};

export default function NotFound() {
  return (
    <section className="text-center">
      <h2 className="text-2xl font-bold">${
    $tr("init.template.notFoundTitle")
  }</h2>
      <p className="mt-2">${$tr("init.template.notFoundMessage")}</p>
      <a href="/" className="mt-6 inline-block bg-indigo-600 px-4 py-2 text-white">
        ${$tr("init.template.backToHome")}
      </a>
    </section>
  );
}
`;

  // ---------------------------------------------------------------------------
  // src/views/_error.tsx（约定错误兜底，路由扫描自动屏蔽）
  // ---------------------------------------------------------------------------
  const errorTsx = `/**
 * ${$tr("init.template.errorComment")}
 */
export function ErrorView(props: { error?: any; onRetry?: () => void }) {
  const message = () => props.error instanceof Error ? props.error.message : String(props.error ?? ${
    JSON.stringify($tr("init.template.unknownError"))
  });
  
  return (
    <section className="text-center">
      <h2 className="text-2xl font-bold">${$tr("init.template.loadFailed")}</h2>
      <p className="mt-2">{message()}</p>
      {props.onRetry && (
        <button type="button" onClick={() => props.onRetry?.()} className="mt-6 bg-indigo-600 px-4 py-2 text-white">
          ${$tr("init.template.retry")}
        </button>
      )}
    </section>
  );
}
`;
  await writeTextFile(
    join(targetDir, "src", "views", "_404.tsx"),
    notFoundTsxContent,
  );
  addFile("src/views/_404.tsx");
  await writeTextFile(
    join(targetDir, "src", "views", "_error.tsx"),
    errorTsx,
  );
  addFile("src/views/_error.tsx");

  // ---------------------------------------------------------------------------
  // src/views/home.tsx（首页：Hero + 简介；浅色：底栏渐变略深 + 卡片白底/描边/投影/ring 强化层级）
  // ---------------------------------------------------------------------------
  const homeTsx = `/**
 * ${$tr("init.template.homeComment")}
 * Signal 在 JSX 中勿写 {count()}（会静态化）；须 {() => String(count())}，与 examples/views/signal 一致。
 */
import { createSignal } from "@dreamer/view";

export const metadata = {
  title: ${JSON.stringify($tr("init.template.homeNavTitle"))},
};

export default function Home() {
  const [count, setCount] = createSignal(0);

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-400/35 ring-1 ring-slate-900/5 sm:p-12 dark:border-slate-700/70 dark:bg-slate-800/95 dark:shadow-xl dark:shadow-black/40 dark:ring-white/10">
        <h1 className="mb-4 text-4xl font-bold text-slate-900 dark:text-slate-100">${
    $tr("init.template.welcomeTitle")
  }</h1>
        <p className="text-slate-600 leading-relaxed dark:text-slate-300">${
    $tr("init.template.homeIntro")
  }</p>
        <a href="/about" className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/30 transition-colors hover:bg-indigo-700 hover:shadow-lg dark:shadow-indigo-950/40">
          ${$tr("init.template.goToAbout")}
        </a>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-400/35 ring-1 ring-slate-900/5 sm:p-12 dark:border-slate-700/70 dark:bg-slate-800/95 dark:shadow-xl dark:shadow-black/40 dark:ring-white/10">
        <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">${
    $tr("init.template.counterDemo")
  }</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCount(count() - 1)} className="rounded-lg border border-slate-200 px-4 py-2 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">−</button>
          <span className="min-w-12 text-center text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{() => String(count())}</span>
          <button type="button" onClick={() => setCount(count() + 1)} className="rounded-lg bg-indigo-600 px-4 py-2 text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-95 dark:shadow-none">+</button>
        </div>
      </section>
    </div>
  );
}
`;
  await writeTextFile(join(targetDir, "src", "views", "home.tsx"), homeTsx);
  addFile("src/views/home.tsx");

  // ---------------------------------------------------------------------------
  // src/views/about.tsx（关于页，美化）
  // ---------------------------------------------------------------------------
  const aboutTsx = `/**
 * ${$tr("init.template.aboutComment")}
 * 返回首页使用 Link，与顶栏一致走客户端路由；样式与首页「前往关于」主按钮统一。
 */
import { Link } from "@dreamer/view";

export default function About() {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-400/35 ring-1 ring-slate-900/5 sm:p-12 dark:border-slate-700/70 dark:bg-slate-800/95 dark:shadow-xl dark:shadow-black/40 dark:ring-white/10">
        <h1 className="mb-4 text-3xl font-bold text-slate-900 dark:text-slate-100">${
    $tr("init.template.aboutTitle")
  }</h1>
        <p className="max-w-2xl text-slate-600 leading-relaxed dark:text-slate-300">${
    $tr("init.template.aboutIntro")
  }</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition-all hover:bg-indigo-700 hover:shadow-lg active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:shadow-indigo-950/40 dark:focus-visible:ring-offset-slate-900"
        >
          ${$tr("init.template.backToHome")}
        </Link>
      </section>
    </div>
  );
}
`;
  await writeTextFile(join(targetDir, "src", "views", "about.tsx"), aboutTsx);
  addFile("src/views/about.tsx");

  // ---------------------------------------------------------------------------
  // src/router/router.ts
  // ---------------------------------------------------------------------------
  const routerTs = `/**
 * ${$tr("init.template.routerComment")}
 * 路由器仅在 main.tsx 中 createRouter 一次；此处再导出 useRouter，与 @dreamer/view 全局单例一致，切勿在此再次 createRouter。
 */
export { type Router, useRouter } from "@dreamer/view";
`;
  await writeTextFile(join(targetDir, "src", "router", "router.ts"), routerTs);
  addFile("src/router/router.ts");

  // ---------------------------------------------------------------------------
  // src/router/routers.tsx（路由表：动态 import，dev 时会按 src/views 自动重新生成，勿提交；含根 _layout 以与 examples 一致显示导航）
  // ---------------------------------------------------------------------------
  const rootLayoutImport = '() => import("../views/_layout.tsx")';
  const routersTsx = `/**
 * ${$tr("init.template.routersComment1")}
 * ${$tr("init.template.routersComment2")}
 */
import type { RouteConfig } from "@dreamer/view";

export const routes: RouteConfig[] = [
  { path: "/", component: () => import("../views/home.tsx"), metadata: { title: ${
    JSON.stringify($tr("init.template.homeNavTitle"))
  } }, layouts: [ ${rootLayoutImport} ] },
  { path: "/about", component: () => import("../views/about.tsx"), metadata: { title: ${
    JSON.stringify($tr("init.template.aboutTitle"))
  } }, layouts: [ ${rootLayoutImport} ] },
];

export const notFoundRoute: RouteConfig = {
  path: "*",
  component: () => import("../views/_404.tsx"),
  metadata: { title: "404" },
  layouts: [ ${rootLayoutImport} ],
};
`;
  await writeTextFile(
    join(targetDir, "src", "router", "routers.tsx"),
    routersTsx,
  );
  addFile("src/router/routers.tsx");

  // ---------------------------------------------------------------------------
  // src/stores/theme.ts
  // ---------------------------------------------------------------------------
  const themeTs = `import { createStore } from "@dreamer/view";

export type Theme = "light" | "dark";

function applyToDom(next: Theme): void {
  if (typeof globalThis.document === "undefined") return;
  globalThis.document.documentElement.classList.toggle("dark", next === "dark");
}

export const themeStore = createStore(
  "examples-theme-store",
  { theme: "light" as Theme },
  { key: "view-theme" },
);

if (typeof globalThis.document !== "undefined") {
  applyToDom(themeStore.theme);
}

export function theme(): Theme {
  return themeStore.theme;
}

export function setTheme(next: Theme): void {
  themeStore.theme = next;
  applyToDom(next);
}

export function toggleTheme(): void {
  setTheme(themeStore.theme === "dark" ? "light" : "dark");
}
`;
  await writeTextFile(join(targetDir, "src", "stores", "theme.ts"), themeTs);
  addFile("src/stores/theme.ts");

  await writeTextFile(
    join(targetDir, "src", "hooks", "index.ts"),
    'export { useRouter } from "../router/router.ts";\n',
  );
  addFile("src/hooks/index.ts");
  await writeTextFile(
    join(targetDir, "src", "utils", "README.md"),
    "# utils\n",
  );
  addFile("src/utils/README.md");

  // ---------------------------------------------------------------------------
  // .gitignore：忽略构建产物与自动生成的路由表（勿提交）
  // ---------------------------------------------------------------------------
  const gitignorePath = join(targetDir, ".gitignore");
  const routersIgnore = "src/router/routers.tsx";
  if (existsSync(gitignorePath)) {
    const content = await readTextFile(gitignorePath);
    if (
      !content.includes("routers.tsx") && !content.includes("router/routers")
    ) {
      await writeTextFile(
        gitignorePath,
        content.trimEnd() + "\n" + routersIgnore + "\n",
      );
      addFile(".gitignore");
    }
  } else {
    await writeTextFile(
      gitignorePath,
      "node_modules\ndist/\n" + routersIgnore + "\n",
    );
    addFile(".gitignore");
  }

  const prefix = displayDir === "." ? "" : displayDir + "/";
  createdFiles.sort();
  for (const f of createdFiles) {
    logger.info(prefix + f);
  }

  // 成功文案用 logger.info 输出并保留绿色；空行用 console.log 输出
  console.log("");
  logger.info(
    `${GREEN}${$tr("cli.init.projectCreated", { dir: displayDir })}${RESET}`,
  );
  console.log("");

  if (displayDir !== ".") {
    logger.info($tr("cli.init.nextCd", { dir: displayDir }));
  }
  if (runtime === "bun") {
    logger.info($tr("cli.init.nextInstallBun"));
    logger.info($tr("cli.init.nextDevBun"));
    logger.info($tr("cli.init.nextBuildBun"));
    logger.info($tr("cli.init.nextProdBun"));
  } else {
    logger.info($tr("cli.init.nextDev"));
    logger.info($tr("cli.init.nextBuild"));
    logger.info($tr("cli.init.nextProd"));
  }
  console.log("");
}

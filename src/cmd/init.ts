/**
 * init 命令：按示例项目结构初始化新项目
 * 使用 @dreamer/runtime-adapter 做文件与路径操作，兼容 Deno / Bun。
 * 版本号通过 `server/utils/version.ts` 获取（支持缓存与 --beta：稳定版高于 beta 时仍用稳定版）。
 * 生成 views 下约定特殊文件 _app.tsx、_layout.tsx、_loading.tsx、_404.tsx、_error.tsx（路由扫描自动屏蔽）与路由页 home/about，风格参考 view/examples。
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
import { $tr, detectLocale } from "../server/utils/i18n.ts";
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
 * @param options options.dir 为可选目标目录（默认当前目录），options.beta 为 true 时允许使用最新 beta（若稳定版更高则仍用稳定版）
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
      exclude: ["tailwind.css", "global.css", "index.css"],
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
    // port: 8787,
    // host: "127.0.0.1",
    dev: {
      port: 8787,
      host: "127.0.0.1",
      dev: {
        hmr: { enabled: true, path: "/__hmr" },
        watch: {
          paths: ["./src"],
          ignore: ["node_modules", ".git", "dist", "routers.tsx"],
        },
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
        types: ["./jsx.d.ts"],
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
      include: ["src/**/*", "jsx.d.ts"],
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
  // jsx.d.ts（JSX 固有元素类型，供 TSX 类型检查；deno.json compilerOptions.types 或 tsconfig include 引用）
  // ---------------------------------------------------------------------------
  const jsxDts = `/**
 * ${$tr("init.template.jsxDtsComment")}
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [tag: string]: Record<string, unknown>;
    }
  }
}

export {};
`;
  await writeTextFile(join(targetDir, "jsx.d.ts"), jsxDts);
  addFile("jsx.d.ts");

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

  // 占位全局样式与页面样式（main.tsx / 页面中已注释 import，取消注释即可使用）
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
/** ${$tr("init.template.globalCssImportComment")} */
// import "./assets/global.css";

import { mount, insert } from "@dreamer/view";
import { createAppRouter } from "./router/router.ts";
import { App } from "./views/_app.tsx";
import { notFoundRoute, routes } from "./router/routers.tsx";

const router = createAppRouter({ routes, notFound: notFoundRoute });
mount("#root", (el) => insert(el, () => <App router={router} />), { noopIfNotFound: true });
`;
  await writeTextFile(join(targetDir, "src", "main.tsx"), mainTsx);
  addFile("src/main.tsx");

  // ---------------------------------------------------------------------------
  // src/views/_app.tsx（约定根组件，路由扫描自动屏蔽）
  // ---------------------------------------------------------------------------
  const appTsx = `/**
 * ${$tr("init.template.appComment")}
 * ${$tr("init.template.appLayoutInheritComment")}
 */
import type { VNode } from "@dreamer/view";
import { RoutePage, type Router } from "@dreamer/view/router";

export function App(props: { router: Router }): VNode {
  const current = props.router.getCurrentRouteSignal()();
  if (!current) {
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-12 shadow-lg dark:border-slate-600/80 dark:bg-slate-800/90 flex min-h-[200px] items-center justify-center">
        <p className="text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          ${$tr("init.template.loading")}
        </p>
      </section>
    );
  }
  return (
    <RoutePage
      match={current}
      router={props.router}
      labels={{
        errorTitle: ${JSON.stringify($tr("init.template.routePageLoadFailed"))},
        retryText: ${JSON.stringify($tr("init.template.routePageRetry"))},
        loadingText: ${JSON.stringify($tr("init.template.routePageLoading"))},
      }}
    />
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
 * ${$tr("init.template.layoutRootDefaultComment")}
 */
import type { VNode } from "@dreamer/view";
import type { RouteConfig } from "@dreamer/view/router";
import { routes } from "../router/routers.tsx";
import { theme, toggleTheme } from "../stores/theme.ts";

export interface NavItem {
  path: string;
  label: string;
}

function navItemsFromRoutes(routes: RouteConfig[]): NavItem[] {
  return routes
    .filter((r) => r.path !== "*")
    .map((r) => ({
      path: r.path,
      label: (r.metadata?.title as string) ?? r.path,
    }));
}

interface LayoutProps {
  routes?: RouteConfig[];
  currentPath?: string;
  children: VNode | VNode[];
}

export function Layout(props: LayoutProps): VNode {
  const { children } = props;
  const routesProp = props.routes ?? routes;
  const currentPath = props.currentPath ?? "";
  const navItems = navItemsFromRoutes(routesProp);
  const isDark = theme() === "dark";
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-800/80">
        <nav className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <a
            href="/"
            className="text-lg font-semibold tracking-tight text-slate-800 hover:text-indigo-600 transition-colors dark:text-slate-200 dark:hover:text-indigo-400"
          >
            ${headerTitle}
          </a>
          <div className="flex items-center gap-2">
            <ul className="flex list-none items-center gap-1">
              {navItems.map((item) => {
                const isActive = currentPath === item.path;
                return (
                  <li key={item.path}>
                    <a
                      href={item.path}
                      className={isActive
                        ? "rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-900/50"
                        : "rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"}
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => toggleTheme()}
              className="rounded-lg border-0 bg-transparent p-2 text-slate-600 outline-none hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              title={isDark ? ${
    JSON.stringify($tr("init.template.switchToLight"))
  } : ${JSON.stringify($tr("init.template.switchToDark"))}}
              aria-label={isDark ? ${
    JSON.stringify($tr("init.template.switchToLight"))
  } : ${JSON.stringify($tr("init.template.switchToDark"))}}
            >
              {isDark ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <a
              href="https://github.com/shuliangfu/view"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border-0 bg-transparent p-2 text-slate-600 outline-none hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              title="GitHub"
              aria-label="GitHub"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}

/** ${$tr("init.template.layoutRootDefaultComment")} */
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
import type { VNode } from "@dreamer/view";

export default function RouteLoading(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-12 shadow-lg dark:border-slate-600/80 dark:bg-slate-800/90 flex min-h-[200px] items-center justify-center">
      <p className="text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
        ${$tr("init.template.loading")}
      </p>
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
import type { VNode } from "@dreamer/view";

export const metadata = {
  title: "404",
  description: ${JSON.stringify($tr("init.template.notFoundDesc"))},
};

export default function NotFound(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-12 shadow-xl text-center dark:border-slate-600/80 dark:bg-slate-800/95">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">${
    $tr("init.template.notFoundTitle")
  }</h2>
      <p className="mt-2 text-slate-600 dark:text-slate-300">${
    $tr("init.template.notFoundMessage")
  }</p>
      <a
        href="/"
        className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
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
import type { VNode } from "@dreamer/view";

interface ErrorViewProps {
  error?: unknown;
  onRetry?: () => void;
}

export function ErrorView(props: ErrorViewProps): VNode {
  const message = props.error instanceof Error ? props.error.message : String(props.error ?? ${
    JSON.stringify($tr("init.template.unknownError"))
  });
  return (
    <section className="rounded-2xl border border-red-200/80 bg-white p-12 shadow-xl text-center dark:border-red-800/80 dark:bg-slate-800/95">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">${
    $tr("init.template.loadFailed")
  }</h2>
      <p className="mt-2 text-slate-600 dark:text-slate-300 wrap-break-word">{message}</p>
      {props.onRetry && (
        <button type="button" onClick={() => props.onRetry?.()} className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
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
  // src/views/home.tsx（首页：Hero + 简介，美化）
  // ---------------------------------------------------------------------------
  const homeTsx = `/**
 * ${$tr("init.template.homeComment")}
 */
/** ${$tr("init.template.pageCssImportComment")} */
// import "../assets/index.css";

import { createSignal } from "@dreamer/view";
import type { VNode } from "@dreamer/view";

export const metadata = {
  title: ${JSON.stringify($tr("init.template.homeNavTitle"))},
};

export default function Home(): VNode {
  const [count, setCount] = createSignal(0);

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl dark:border-slate-600/80 dark:bg-slate-800/95 sm:p-12">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          ${$tr("init.template.viewTemplateEngine")}
        </p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          ${$tr("init.template.welcomeTitle")}
        </h1>
        <p className="max-w-xl text-slate-600 dark:text-slate-300 leading-relaxed">
          ${$tr("init.template.homeIntro")}
        </p>
        <a
          href="/about"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          ${$tr("init.template.goToAbout")}
          <span aria-hidden="true">→</span>
        </a>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl dark:border-slate-600/80 dark:bg-slate-800/95 sm:p-12">
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
          ${$tr("init.template.counterDemo")}
        </h2>
        <p className="mb-6 max-w-xl text-sm text-slate-600 dark:text-slate-300">
          ${$tr("init.template.counterIntro")}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setCount(count() - 1)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            −
          </button>
          <span className="min-w-12 text-center text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
            {count}
          </span>
          <button
            type="button"
            onClick={() => setCount(count() + 1)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            +
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl dark:border-slate-600/80 dark:bg-slate-800/95 sm:p-12">
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
          ${$tr("init.template.vIfDemo")}
        </h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          ${$tr("init.template.vIfIntro")}
        </p>
        <div vIf={() => count() <= 2} className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-900/20">
          <span className="rounded-full bg-emerald-200/80 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-700/50 dark:text-emerald-200">
            ${$tr("init.template.countLabelLow")}
          </span>
          <span className="text-base font-medium text-emerald-800 dark:text-emerald-200">${
    $tr("init.template.labelAAA")
  }</span>
        </div>
        <div vElseIf={() => count() >= 3 && count() <= 5} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-900/20">
          <span className="rounded-full bg-amber-200/80 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-700/50 dark:text-amber-200">
            ${$tr("init.template.countLabelMid")}
          </span>
          <span className="text-base font-medium text-amber-800 dark:text-amber-200">${
    $tr("init.template.labelBBB")
  }</span>
        </div>
        <div vElse className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-500/30 dark:bg-slate-700/30">
          <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-600/80 dark:text-slate-200">
            ${$tr("init.template.countLabelHigh")}
          </span>
          <span className="text-base font-medium text-slate-800 dark:text-slate-200">${
    $tr("init.template.labelCCC")
  }</span>
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
 */
import type { VNode } from "@dreamer/view";

export default function About(): VNode {
  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl dark:border-slate-600/80 dark:bg-slate-800/95 sm:p-12">
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          ${$tr("init.template.aboutTitle")}
        </h1>
        <p className="mb-4 text-slate-600 dark:text-slate-300 leading-relaxed">
          ${$tr("init.template.aboutIntro")}
        </p>
        <ul className="list-inside list-disc space-y-2 text-slate-600 dark:text-slate-300">
          <li>${$tr("init.template.aboutItemReactive")}</li>
          <li>${$tr("init.template.aboutItemRouter")}</li>
          <li>${$tr("init.template.aboutItemStore")}</li>
          <li>${$tr("init.template.aboutItemBoundary")}</li>
        </ul>
        <a
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <span aria-hidden="true">←</span>
          ${$tr("init.template.backToHome")}
        </a>
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
 */
import {
  createContext,
  type ProviderChildren,
} from "@dreamer/view/context";
import {
  createRouter as createViewRouter,
  type RouteConfig,
  type Router,
} from "@dreamer/view/router";
import type { VNode } from "@dreamer/view";

export const RouterContext = createContext<Router | null>(null, "Router");

export function RouterProvider(props: {
  router: Router;
  children: ProviderChildren;
}): VNode | VNode[] | null {
  return RouterContext.Provider({
    value: props.router,
    children: props.children,
  });
}

RouterContext.registerProviderAlias(
  RouterProvider as (p: Record<string, unknown>) => VNode | VNode[] | null,
  (p) => (p as { router: Router }).router,
);

export function useRouter(): Router | null {
  return RouterContext.useContext();
}

export function createAppRouter(opts: {
  routes: RouteConfig[];
  notFound: RouteConfig;
}): Router {
  if (typeof createViewRouter !== "function") {
    throw new Error(${JSON.stringify($tr("init.routerUndefined"))});
  }
  const router = createViewRouter({
    routes: opts.routes,
    notFound: opts.notFound,
    interceptLinks: true,
    afterRoute: (to) => {
      const title = (to?.metadata?.title as string) ?? "";
      if (title && typeof globalThis.document !== "undefined") {
        globalThis.document.title = \`\${title} - @dreamer/view\`;
      }
    },
  });
  router.start();
  return router;
}
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
import type { RouteConfig } from "@dreamer/view/router";

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
  const themeTs =
    `import { createStore, withActions } from "@dreamer/view/store";

export type Theme = "light" | "dark";
type ThemeState = Record<string, unknown> & { theme: Theme };

function applyToDom(theme: Theme): void {
  if (typeof globalThis.document === "undefined") return;
  globalThis.document.documentElement.classList.toggle("dark", theme === "dark");
}

export const themeStore = createStore("theme", {
  state: { theme: "light" as Theme } as ThemeState,
  actions: withActions<ThemeState, { setTheme: (n: Theme) => void; toggleTheme: () => void }>()({
    setTheme(next) {
      this.theme = next;
      applyToDom(next);
    },
    toggleTheme() {
      this.setTheme(this.theme === "dark" ? "light" : "dark");
    },
  }),
  persist: { key: "view-theme" },
});
applyToDom(themeStore.theme);
export function theme(): Theme {
  return themeStore.theme;
}
export const setTheme = themeStore.setTheme;
export const toggleTheme = themeStore.toggleTheme;
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

/**
 * SSR 伪 DOM / Element / Document API 契约（Deno/Bun 无浏览器 document）。
 * 覆盖 dweb hybrid 曾触发的 hasAttribute 问题，以及 2.0.5 补全的方法面。
 */
import { describe, expect, it } from "@dreamer/test";
import { jsx } from "../../../src/jsx-runtime.ts";
import { setProperty } from "../../../src/runtime/props.ts";
import { renderToString } from "../../../src/runtime/server.ts";
import {
  installMinimalSsrGlobals,
  type SsrElement,
  type SsrNode,
} from "../../../src/runtime/ssr-dom.ts";

/** 安装 SSR 全局并保证 teardown */
function withSsrDoc<T>(
  fn: (doc: ReturnType<typeof installMinimalSsrGlobals>["document"]) => T,
): T {
  const { document: doc, teardown } = installMinimalSsrGlobals();
  try {
    return fn(doc);
  } finally {
    teardown();
  }
}

describe("ssr-dom Element API (Bun/Deno SSR)", () => {
  // ---------- 属性 ----------
  it("SsrElement 应实现 hasAttribute / toggleAttribute / get-set-removeAttribute", () => {
    withSsrDoc((doc) => {
      const el = doc.createElement("div") as SsrElement;
      expect(el.hasAttribute("id")).toBe(false);
      el.setAttribute("id", "x");
      expect(el.hasAttribute("id")).toBe(true);
      expect(el.getAttribute("id")).toBe("x");
      el.toggleAttribute("hidden");
      expect(el.hasAttribute("hidden")).toBe(true);
      el.toggleAttribute("hidden", false);
      expect(el.hasAttribute("hidden")).toBe(false);
      el.toggleAttribute("open", true);
      expect(el.hasAttribute("open")).toBe(true);
      el.removeAttribute("id");
      expect(el.hasAttribute("id")).toBe(false);
      // 大小写不敏感
      el.setAttribute("Data-Foo", "1");
      expect(el.hasAttribute("data-foo")).toBe(true);
      expect(el.getAttribute("DATA-FOO")).toBe("1");
    });
  });

  it("NS 属性 API 应委托到普通属性路径", () => {
    withSsrDoc((doc) => {
      const el = doc.createElement("div") as SsrElement;
      el.setAttributeNS(null, "aria-label", "L");
      expect(el.hasAttributeNS(null, "aria-label")).toBe(true);
      expect(el.getAttributeNS(null, "aria-label")).toBe("L");
      el.removeAttributeNS(null, "aria-label");
      expect(el.hasAttribute("aria-label")).toBe(false);
    });
  });

  // ---------- style ----------
  it("style 应支持 removeProperty / setProperty / getPropertyValue / cssText", () => {
    withSsrDoc((doc) => {
      const el = doc.createElement("div") as SsrElement;
      el.style.setProperty("color", "red");
      expect(el.style.getPropertyValue("color")).toBe("red");
      el.style.setProperty("margin-top", "2px");
      expect(el.style.getPropertyValue("margin-top")).toBe("2px");
      const removed = el.style.removeProperty("color");
      expect(removed).toBe("red");
      expect(el.style.getPropertyValue("color")).toBe("");
      el.style.cssText = "margin-top: 1px; color: blue";
      expect(el.style.getPropertyValue("color")).toBe("blue");
      expect(String(el.style.cssText)).toContain("blue");
    });
  });

  // ---------- setProperty 运行时 ----------
  it("setProperty 对 null 属性不应抛 hasAttribute 错误", () => {
    withSsrDoc((doc) => {
      const el = doc.createElement("div") as unknown as Element;
      el.setAttribute("data-a", "1");
      expect(() => setProperty(el, "data-a", null)).not.toThrow();
      expect(el.hasAttribute("data-a")).toBe(false);
      expect(() => setProperty(el, "title", undefined)).not.toThrow();
      expect(() => setProperty(el, "title", "ok")).not.toThrow();
      expect(el.getAttribute("title")).toBe("ok");
      // id undefined 不应写成字面量
      expect(() => setProperty(el, "id", undefined)).not.toThrow();
    });
  });

  // ---------- classList / dataset / matches / closest / query ----------
  it("应支持 classList 全套：add/remove/toggle/replace/contains/length", () => {
    withSsrDoc((doc) => {
      const el = doc.createElement("div") as SsrElement;
      el.classList.add("a", "b", "c");
      expect(el.classList.length).toBe(3);
      expect(el.classList.contains("b")).toBe(true);
      el.classList.remove("b");
      expect(el.classList.contains("b")).toBe(false);
      expect(el.classList.toggle("a")).toBe(false); // 已有 → 去掉
      expect(el.classList.contains("a")).toBe(false);
      expect(el.classList.toggle("a", true)).toBe(true);
      expect(el.classList.replace("c", "d")).toBe(true);
      expect(el.classList.contains("d")).toBe(true);
      expect(el.classList.replace("missing", "x")).toBe(false);
      expect(el.classList.toString()).toContain("d");
    });
  });

  it("应支持 dataset 读写与删除", () => {
    withSsrDoc((doc) => {
      const el = doc.createElement("div") as SsrElement;
      el.dataset.userId = "42";
      expect(el.getAttribute("data-user-id")).toBe("42");
      expect(el.dataset.userId).toBe("42");
      delete el.dataset.userId;
      expect(el.hasAttribute("data-user-id")).toBe(false);
    });
  });

  it("应支持 matches / closest / querySelector / querySelectorAll / 逗号选择器", () => {
    withSsrDoc((doc) => {
      const root = doc.createElement("div") as SsrElement;
      root.id = "root";
      root.classList.add("wrap", "x");
      const a = doc.createElement("a") as SsrElement;
      a.setAttribute("href", "/about");
      a.classList.add("link");
      root.append(a);
      const nested = doc.createElement("span") as SsrElement;
      nested.dataset.role = "x";
      a.append(nested);
      const b = doc.createElement("button") as SsrElement;
      b.classList.add("btn");
      root.append(b);

      expect(a.matches("a[href]")).toBe(true);
      expect(a.matches(".link")).toBe(true);
      expect(a.matches("div")).toBe(false);
      expect(nested.closest("a[href]")).toBe(a);
      expect(nested.closest("#root")).toBe(root);
      expect(nested.closest("button")).toBeNull();
      expect(root.querySelector("a.link")).toBe(a);
      expect(root.querySelectorAll("span").length).toBe(1);
      expect(root.querySelectorAll("a, button").length).toBe(2);
      expect(root.querySelectorAll(".wrap").length).toBe(0); // 不含自身
      expect(root.nodeName).toBe("DIV");
      expect(root.children.length).toBe(2);
      expect(root.childElementCount).toBe(2);
      expect(root.firstElementChild).toBe(a);
      expect(root.lastElementChild).toBe(b);
    });
  });

  it("应支持后代选择器与 * / #id", () => {
    withSsrDoc((doc) => {
      const root = doc.createElement("section") as SsrElement;
      const p = doc.createElement("p") as SsrElement;
      p.id = "para";
      const em = doc.createElement("em") as SsrElement;
      p.append(em);
      root.append(p);
      expect(root.querySelector("p em")).toBe(em);
      expect(root.querySelector("#para")).toBe(p);
      expect(root.querySelectorAll("*").length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------- 节点关系 ----------
  it("节点关系：parentElement / siblings / contains / isConnected / hasChildNodes", () => {
    withSsrDoc((doc) => {
      const parent = doc.createElement("div") as SsrElement;
      const t1 = doc.createTextNode("a");
      const el = doc.createElement("span") as SsrElement;
      const t2 = doc.createTextNode("b");
      parent.append(t1, el, t2);

      expect(parent.hasChildNodes()).toBe(true);
      expect(parent.firstChild).toBe(t1);
      expect(parent.lastChild).toBe(t2);
      expect(el.previousSibling).toBe(t1);
      expect(el.nextSibling).toBe(t2);
      expect(el.parentNode).toBe(parent);
      expect(el.parentElement).toBe(parent);
      expect(parent.contains(el)).toBe(true);
      expect(parent.contains(t1 as unknown as SsrNode)).toBe(true);
      expect(el.contains(parent)).toBe(false);

      // 挂到 documentElement 后 isConnected
      doc.documentElement.appendChild(parent);
      expect(parent.isConnected).toBe(true);
      expect(el.isConnected).toBe(true);

      const orphan = doc.createElement("i") as SsrElement;
      expect(orphan.isConnected).toBe(false);
      expect(orphan.hasChildNodes()).toBe(false);
    });
  });

  it("Text/Comment 应有 nodeName 与 outerHTML", () => {
    withSsrDoc((doc) => {
      const t = doc.createTextNode("hi");
      expect(t.nodeName).toBe("#text");
      expect(t.nodeType).toBe(3);
      const c = doc.createComment("mark");
      expect(c.nodeName).toBe("#comment");
      expect(c.nodeType).toBe(8);
      expect((c as { outerHTML?: string }).outerHTML).toContain("mark");
    });
  });

  // ---------- 现代插入 API ----------
  it("append / prepend / before / after / replaceWith / remove 应正确改树", () => {
    withSsrDoc((doc) => {
      const parent = doc.createElement("div") as SsrElement;
      const a = doc.createElement("a") as SsrElement;
      const b = doc.createElement("b") as SsrElement;
      const c = doc.createElement("c") as SsrElement;
      parent.append(a);
      parent.prepend(b); // b, a
      expect(parent.firstElementChild).toBe(b);
      a.after(c); // b, a, c
      expect(parent.lastElementChild).toBe(c);
      c.before(doc.createTextNode("-"));
      expect(parent.childNodes.length).toBe(4);
      a.replaceWith(doc.createElement("x") as SsrElement);
      expect(parent.querySelector("a")).toBeNull();
      expect(parent.querySelector("x")).not.toBeNull();
      b.remove();
      expect(parent.contains(b)).toBe(false);
    });
  });

  it("replaceChild / cloneNode(deep) 应工作", () => {
    withSsrDoc((doc) => {
      const parent = doc.createElement("div") as SsrElement;
      const oldEl = doc.createElement("span") as SsrElement;
      oldEl.id = "old";
      oldEl.append(doc.createTextNode("t"));
      parent.appendChild(oldEl);
      const neu = doc.createElement("p") as SsrElement;
      parent.replaceChild(neu, oldEl);
      expect(parent.firstElementChild).toBe(neu);
      expect(parent.contains(oldEl)).toBe(false);

      const deep = neu.cloneNode(true) as SsrElement;
      expect(deep).not.toBe(neu);
      expect(deep.nodeName).toBe("P");
    });
  });

  // ---------- 反射属性 / 空操作 ----------
  it("反射属性 id/name/type/href/src/disabled/tabIndex 与 value/checked", () => {
    withSsrDoc((doc) => {
      const input = doc.createElement("input") as SsrElement;
      input.name = "user";
      input.type = "text";
      input.disabled = true;
      input.tabIndex = 2;
      input.value = "v";
      expect(input.getAttribute("name")).toBe("user");
      expect(input.getAttribute("type")).toBe("text");
      expect(input.hasAttribute("disabled")).toBe(true);
      expect(input.tabIndex).toBe(2);
      expect(input.value).toBe("v");
      input.disabled = false;
      expect(input.hasAttribute("disabled")).toBe(false);
      input.checked = true;
      expect(input.checked).toBe(true);

      const a = doc.createElement("a") as SsrElement;
      a.href = "/x";
      expect(a.getAttribute("href")).toBe("/x");
      const img = doc.createElement("img") as SsrElement;
      img.src = "/i.png";
      expect(img.getAttribute("src")).toBe("/i.png");

      // 浏览器 API 在 SSR 为空操作且不抛
      expect(() => {
        input.focus();
        input.blur();
        input.click();
        input.setSelectionRange(0, 1);
      }).not.toThrow();
    });
  });

  it("安全：href/src 直接 setter 与 setAttribute 应对齐消毒", () => {
    withSsrDoc((doc) => {
      const a = doc.createElement("a") as SsrElement;
      a.href = "https://ok.example/";
      expect(a.getAttribute("href")).toContain("ok.example");
      a.href = "javascript:alert(1)";
      expect(a.getAttribute("href")).toBeNull();

      const img = doc.createElement("img") as SsrElement;
      img.src = "/safe.png";
      expect(img.getAttribute("src")).toBe("/safe.png");
      img.src = "javascript:alert(1)";
      expect(img.getAttribute("src")).toBeNull();

      img.setAttribute("srcset", "/a.jpg 1x, /b.jpg 2x");
      expect(img.getAttribute("srcset")).toContain("/a.jpg");
      img.setAttribute("srcset", "/ok.jpg 1x, javascript:alert(1) 2x");
      expect(img.getAttribute("srcset")).toBeNull();
    });
  });

  it("安全：JSX setProperty 路径危险 URL 不应出现在 renderToString", () => {
    withSsrDoc((_doc) => {
      const html = renderToString(() =>
        jsx("a", { href: "javascript:alert(1)", children: "x" }),
      );
      expect(html).not.toContain("javascript:");
      const imgHtml = renderToString(() =>
        jsx("img", { src: "javascript:alert(1)", alt: "x" }),
      );
      expect(imgHtml).not.toContain("javascript:");
    });
  });

  it("innerHTML / innerText / textContent 应可读写", () => {
    withSsrDoc((doc) => {
      const el = doc.createElement("div") as SsrElement;
      el.innerHTML = "<span>a</span><b>b</b>";
      expect(el.children.length).toBe(2);
      expect(el.textContent).toContain("a");
      el.innerText = "plain";
      expect(el.children.length).toBe(0);
      expect(el.textContent).toBe("plain");
      expect(el.outerHTML).toContain("plain");
    });
  });

  // ---------- Document ----------
  it("document.head / body / querySelector / importNode / getElementById", () => {
    withSsrDoc((doc) => {
      const meta = doc.createElement("meta") as SsrElement;
      meta.setAttribute("name", "description");
      meta.setAttribute("content", "hello");
      doc.head.appendChild(meta);
      const found = doc.querySelector('meta[name="description"]');
      expect(found).toBe(meta);
      expect(found?.getAttribute("content")).toBe("hello");

      const div = doc.createElement("div") as SsrElement;
      div.id = "app";
      doc.body.appendChild(div);
      expect(doc.getElementById("app")).toBe(div);
      expect(doc.querySelectorAll("div").length).toBeGreaterThanOrEqual(1);

      const imported = doc.importNode(div, true) as SsrElement;
      expect(imported).not.toBe(div);
      expect(imported.id).toBe("app");

      expect(doc.defaultView == null || typeof doc.defaultView === "object")
        .toBe(true);
      expect(() => {
        doc.addEventListener("click", () => {});
        doc.dispatchEvent({});
      }).not.toThrow();
    });
  });

  it("DocumentFragment 应可 appendChild 与 clone", () => {
    withSsrDoc((doc) => {
      const frag = doc.createDocumentFragment();
      expect(frag.nodeName).toBe("#document-fragment");
      frag.appendChild(doc.createElement("li"));
      frag.appendChild(doc.createElement("li"));
      expect(frag.childNodes.length).toBe(2);
      const ul = doc.createElement("ul") as SsrElement;
      ul.appendChild(frag);
      // fragment 子节点应被移入 ul
      expect(ul.children.length).toBe(2);
      expect(frag.childNodes.length).toBe(0);
    });
  });

  // ---------- renderToString 集成 ----------
  it("renderToString 对 null/undefined props 应产出可用 HTML（无 hasAttribute 崩溃）", () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    const prevWin = (globalThis as { window?: unknown }).window;
    try {
      delete (globalThis as { document?: unknown }).document;
      delete (globalThis as { window?: unknown }).window;
    } catch {
      (globalThis as { document?: unknown }).document = undefined;
      (globalThis as { window?: unknown }).window = undefined;
    }

    try {
      const html = renderToString(() =>
        jsx("div", {
          id: undefined,
          class: "box",
          "data-a": null,
          title: "t",
          disabled: false,
          children: [
            jsx("a", { href: "/about", children: "about" }),
            jsx("span", { "data-role": "x", children: "s" }),
          ],
        }) as never
      );
      expect(html).toContain("box");
      expect(html).toContain("about");
      expect(html).toContain('title="t"');
      expect(html).toContain('href="/about"');
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("data-a=");
    } finally {
      if (prevDoc !== undefined) {
        (globalThis as { document?: unknown }).document = prevDoc;
      } else {
        try {
          delete (globalThis as { document?: unknown }).document;
        } catch {
          /* ignore */
        }
      }
      if (prevWin !== undefined) {
        (globalThis as { window?: unknown }).window = prevWin;
      }
    }
  });
});

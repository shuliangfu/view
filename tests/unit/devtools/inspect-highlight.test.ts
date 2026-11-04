/**
 * P2: DevTools Owner-tree click highlights the mapped DOM and selects the row.
 * Tracking is VIEW_DEV-only and does not mutate application elements.
 */
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import { resetRegistry } from "../dom-setup.ts";
import { insert } from "@dreamer/view/csr";
import {
  clearTrackedRoots,
  collectOwnerDomElements,
  createRootTracked,
  getOwnerByPath,
  getTrackedRoots,
  type IndexedOwnerNode,
  inspectOwnerIndexed,
  installOwnerDomTracking,
  isOwnerDomTracking,
  recordOwnerElement,
  uninstallOwnerDomTracking,
} from "@dreamer/view/devtools";
import {
  mountDevtoolsOverlay,
  unmountDevtoolsOverlay,
} from "@dreamer/view/devtools/overlay";
import { jsx } from "@dreamer/view/jsx-runtime";
import {
  createOwner,
  createRoot,
  getOwner,
  type Owner,
} from "@dreamer/view/reactivity";

const g = globalThis as { VIEW_DEV?: boolean };

function mockRect(
  el: HTMLElement,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  el.getBoundingClientRect = () =>
    ({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON() {
        return {};
      },
    }) as DOMRect;
}

/** Expand ancestors, then click the row label (not the twist). */
function clickTreePath(shadow: ShadowRoot, path: string): void {
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    const ancestor = parts.slice(0, i).join("/");
    const row = shadow.querySelector(`[data-path="${ancestor}"]`);
    if (!row) {
      throw new Error(`ancestor row missing: ${ancestor} (for ${path})`);
    }
    if (row.getAttribute("aria-expanded") === "false") {
      const twist = row.querySelector("[data-twist]") as HTMLElement | null;
      twist?.click();
    }
  }
  const row = shadow.querySelector(`[data-path="${path}"]`);
  if (!row) throw new Error(`tree row missing: ${path}`);
  const label = row.querySelector(".kind") as HTMLElement | null;
  (label ?? (row as HTMLElement)).click();
}

function findDirectPath(
  root: Owner,
  node: IndexedOwnerNode,
  elementId: string,
): string | null {
  for (const child of node.childNodes) {
    const hit = findDirectPath(root, child, elementId);
    if (hit) return hit;
  }
  const owner = getOwnerByPath(root, node.id);
  const direct = owner
    ? collectOwnerDomElements(owner, { directOnly: true })
    : [];
  if (direct.some((el) => (el as HTMLElement).id === elementId)) return node.id;
  return null;
}

describe("devtools owner DOM map", () => {
  let prevDev: boolean | undefined;

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    resetRegistry();
    uninstallOwnerDomTracking();
    clearTrackedRoots();
  });

  afterEach(() => {
    uninstallOwnerDomTracking();
    clearTrackedRoots();
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("keeps outermost connected elements and drops detached ones", () => {
    const parent = createOwner();
    const child = createOwner();
    parent.children = [child];
    child.owner = parent;
    const outer = document.createElement("div");
    const inner = document.createElement("span");
    const side = document.createElement("p");
    const gone = document.createElement("i");
    outer.appendChild(inner);
    document.body.appendChild(outer);
    document.body.appendChild(side);
    recordOwnerElement(parent, outer);
    recordOwnerElement(parent, inner);
    recordOwnerElement(parent, side);
    recordOwnerElement(parent, gone);
    recordOwnerElement(child, inner);

    const all = collectOwnerDomElements(parent).map((el) => el.tagName).sort();
    expect(all).toEqual(["DIV", "P"]);
    expect(
      collectOwnerDomElements(child, { directOnly: true }).map((el) =>
        el.tagName
      ),
    ).toEqual(["SPAN"]);
    // Subtree of parent collapses span inside div, but child direct stays span.
    expect(collectOwnerDomElements(child).map((el) => el.tagName)).toEqual([
      "SPAN",
    ]);

    outer.remove();
    side.remove();
    expect(collectOwnerDomElements(parent)).toEqual([]);
  });

  it("does not record when VIEW_DEV is off, and install is a no-op", () => {
    g.VIEW_DEV = false;
    const owner = createOwner();
    const el = document.createElement("div");
    document.body.appendChild(el);
    recordOwnerElement(owner, el);
    installOwnerDomTracking();
    expect(isOwnerDomTracking()).toBe(false);
    expect(collectOwnerDomElements(owner)).toEqual([]);
    el.remove();
  });

  it("jsx does not map elements unless tracking is installed", () => {
    expect(isOwnerDomTracking()).toBe(false);
    const container = document.createElement("div");
    document.body.appendChild(container);
    let owner: Owner | null = null;
    createRoot((dispose) => {
      owner = getOwner();
      insert(container, jsx("div", { id: "untracked-host" }));
      dispose();
    });
    expect(collectOwnerDomElements(owner)).toEqual([]);
    expect(container.querySelector("#untracked-host")).not.toBeNull();
    container.remove();
  });
});

describe("devtools overlay inspect highlight", () => {
  let prevDev: boolean | undefined;
  const containers: HTMLElement[] = [];

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    resetRegistry();
    document.documentElement.lang = "en-US";
    uninstallOwnerDomTracking();
    clearTrackedRoots();
    unmountDevtoolsOverlay();
    try {
      globalThis.localStorage?.removeItem("dreamer-view-devtools-overlay");
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    unmountDevtoolsOverlay();
    uninstallOwnerDomTracking();
    clearTrackedRoots();
    document.querySelector("[data-dreamer-view-inspect]")?.remove();
    for (const node of containers) node.remove();
    containers.length = 0;
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  function Card(props: { id: string }) {
    return jsx("section", {
      id: props.id,
      children: jsx("p", { children: props.id }),
    });
  }

  function App() {
    return jsx("div", {
      id: "app-shell",
      children: [
        jsx(Card, { id: "card-a" }),
        jsx(Card, { id: "card-b" }),
      ],
    });
  }

  it("clicking a tree row selects it and outlines the Owner DOM", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    containers.push(container);

    createRootTracked(() => {
      insert(container, jsx(App, {}));
    });
    expect(isOwnerDomTracking()).toBe(true);

    const shell = document.getElementById("app-shell") as HTMLElement;
    const cardA = document.getElementById("card-a") as HTMLElement;
    const cardB = document.getElementById("card-b") as HTMLElement;
    expect(shell).not.toBeNull();
    expect(cardA).not.toBeNull();
    expect(cardB).not.toBeNull();
    mockRect(shell, 0, 0, 200, 400);
    mockRect(cardA, 10, 20, 100, 50);
    mockRect(cardB, 12, 80, 90, 40);

    const root = getTrackedRoots()[0]!;
    const indexed = inspectOwnerIndexed(root, { rootId: "0" })!;
    const cardPath = findDirectPath(root, indexed, "card-a");
    const otherPath = findDirectPath(root, indexed, "card-b");
    const shellPath = findDirectPath(root, indexed, "app-shell");
    if (!cardPath || !otherPath || !shellPath) {
      throw new Error(
        `missing owner paths card=${cardPath} other=${otherPath} shell=${shellPath}`,
      );
    }
    expect(cardPath).not.toBe(otherPath);

    const handle = mountDevtoolsOverlay({
      refreshMs: 0,
      watchMisuse: false,
    })!;
    handle.open();
    const shadow = handle.root.shadowRoot!;
    clickTreePath(shadow, cardPath);

    const selected = shadow.querySelector(".tree-row.selected") as HTMLElement;
    expect(selected).not.toBeNull();
    expect(selected.getAttribute("data-path")).toBe(cardPath);
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expect(shadow.querySelectorAll(".tree-row.selected").length).toBe(1);
    expect(shadow.querySelectorAll('[aria-selected="true"]').length).toBe(1);
    const css = shadow.querySelector("style")!.textContent!;
    expect(css).toMatch(/\.tree-row\.selected\s*\{[^}]*box-shadow:\s*inset/);

    const layer = document.querySelector(
      "[data-dreamer-view-inspect]",
    ) as HTMLElement;
    expect(layer).not.toBeNull();
    expect(layer.getAttribute("data-inspect-path")).toBe(cardPath);
    const boxes = layer.querySelectorAll("[data-inspect-box]");
    expect(boxes.length).toBe(1);
    const box = boxes[0] as HTMLElement;
    expect(box.style.left).toBe("10px");
    expect(box.style.top).toBe("20px");
    expect(box.style.width).toBe("100px");
    expect(box.style.height).toBe("50px");
    expect(layer.querySelector("[data-inspect-label]")!.textContent).toBe(
      cardPath,
    );
    expect(layer.style.pointerEvents).toBe("none");

    const detail = shadow.querySelector("[data-el='tree-detail']")!
      .textContent!;
    expect(detail).toContain(cardPath);
    expect(detail).not.toMatch(/No connected DOM/i);

    // Another node moves the outline.
    clickTreePath(shadow, otherPath);
    const selectedB = shadow.querySelector(
      ".tree-row.selected",
    ) as HTMLElement;
    expect(selectedB.getAttribute("data-path")).toBe(otherPath);
    const boxB = document.querySelector("[data-inspect-box]") as HTMLElement;
    expect(boxB.style.left).toBe("12px");
    expect(boxB.style.top).toBe("80px");
    expect(boxB.style.width).toBe("90px");
    expect(boxB.style.height).toBe("40px");

    // Parent shell is one outer rect (children sit inside it).
    clickTreePath(shadow, shellPath);
    const shellBoxes = document.querySelectorAll("[data-inspect-box]");
    expect(shellBoxes.length).toBe(1);
    const shellBox = shellBoxes[0] as HTMLElement;
    expect(shellBox.style.left).toBe("0px");
    expect(shellBox.style.top).toBe("0px");
    expect(shellBox.style.width).toBe("200px");
    expect(shellBox.style.height).toBe("400px");

    // Closing the panel removes the page outline; reopening restores it.
    handle.close();
    expect(document.querySelector("[data-dreamer-view-inspect]")).toBeNull();
    expect(handle.isOpen).toBe(false);
    handle.open();
    const restored = document.querySelector(
      "[data-dreamer-view-inspect]",
    ) as HTMLElement;
    expect(restored).not.toBeNull();
    expect(restored.getAttribute("data-inspect-path")).toBe(shellPath);

    handle.unmount();
    expect(document.querySelector("[data-dreamer-view-inspect]")).toBeNull();
    expect(document.querySelector("[data-dreamer-view-devtools]")).toBeNull();
  });
});

/**
 * P1-view-rerun-fetch-guard: non-route updates must not whole-tree remount a child
 * whose setup merely reads Signals (those reads are untracked at the component boundary).
 */
import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  createContext,
  createSignal,
  useContext,
} from "@dreamer/view/reactivity";
import { jsx } from "@dreamer/view/jsx-runtime";
import { mount } from "@dreamer/view/csr";
import { insert } from "../../../src/runtime/insert.ts";
import { flushPendingSync } from "../../../src/scheduler/batch.ts";

describe("runtime/component-rerun-guard (P1)", () => {
  it("child setup Signal read does not remount host DOM on update", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const [n, setN] = createSignal(0);
    let setups = 0;

    function Child() {
      setups++;
      // Top-level read — must NOT subscribe parent insert Effect (untrack in jsx).
      const _peek = n();
      void _peek;
      return jsx("div", {
        id: "child",
        // Fine-grained text update:
        children: () => String(n()),
      });
    }

    const dispose = mount(() => jsx(Child, {}), root);
    const el = root.querySelector("#child");
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe("0");
    expect(setups).toBe(1);

    setN(1);
    flushPendingSync();

    expect(root.querySelector("#child")).toBe(el); // same node — no whole-tree remount
    expect(el!.textContent).toBe("1");
    expect(setups).toBe(1); // setup ran once

    dispose();
    root.remove();
  });

  it("parent-driven remount still allowed when parent Effect re-runs", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const [page, setPage] = createSignal("a");
    let childSetups = 0;

    function Child(props: { page: string }) {
      childSetups++;
      return jsx("div", { id: "child", "data-page": props.page });
    }

    function Parent() {
      // Parent reading page() while tracked (Parent itself is untracked at boundary,
      // so we expose page via a nested insert thunk instead):
      return () => jsx(Child, { page: page() });
    }

    const dispose = mount(() => jsx(Parent, {}), root);
    const first = root.querySelector("#child");
    expect(first?.getAttribute("data-page")).toBe("a");
    expect(childSetups).toBe(1);

    setPage("b");
    flushPendingSync();

    const second = root.querySelector("#child");
    expect(second?.getAttribute("data-page")).toBe("b");
    // Parent thunk re-ran → Child remount (route-like) — setups increased
    expect(childSetups).toBeGreaterThanOrEqual(2);
    expect(second).not.toBe(first);

    dispose();
    root.remove();
  });

  it("signal-of-object Context updates via Proxy without remounting consumer", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const UserContext = createContext({ name: "Guest", role: "none" });
    let setups = 0;
    let setUser!: (v: { name: string; role: string }) => void;

    function UserProfile() {
      setups++;
      const user = useContext(UserContext) as { name: string; role: string };
      // Compiler-style: insert(() => user.name) so Proxy re-reads the getter.
      const el = document.createElement("div");
      el.id = "profile";
      const nameSpan = document.createElement("span");
      nameSpan.id = "name";
      el.appendChild(nameSpan);
      insert(nameSpan, () => user.name);
      return el;
    }

    function Demo() {
      const [user, set] = createSignal({ name: "Guest", role: "none" });
      setUser = set;
      return jsx(UserContext.Provider as never, {
        value: user,
        children: jsx(UserProfile as never, {}),
      });
    }

    const dispose = mount(() => jsx(Demo as never, {}), root);
    const profile = root.querySelector("#profile");
    expect(root.querySelector("#name")?.textContent).toBe("Guest");
    expect(setups).toBe(1);

    setUser({ name: "Admin", role: "superuser" });
    flushPendingSync();

    expect(root.querySelector("#profile")).toBe(profile); // no remount
    expect(root.querySelector("#name")?.textContent).toBe("Admin");
    expect(setups).toBe(1);

    dispose();
    root.remove();
  });

  it("jsx-runtime-style Context needs () => user.name under setup untrack", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const UserContext = createContext({ name: "Guest", role: "none" });
    let setUser!: (v: { name: string; role: string }) => void;

    function UserProfile() {
      const user = useContext(UserContext) as { name: string; role: string };
      return jsx("div", {
        id: "profile",
        children: jsx("span", {
          id: "name",
          // esbuild react-jsx path: must be a thunk, not eager user.name
          children: () => user.name,
        }),
      });
    }

    function Demo() {
      const [user, set] = createSignal({ name: "Guest", role: "none" });
      setUser = set;
      return jsx(UserContext.Provider as never, {
        value: user,
        children: jsx(UserProfile as never, {}),
      });
    }

    const dispose = mount(() => jsx(Demo as never, {}), root);
    expect(root.querySelector("#name")?.textContent).toBe("Guest");
    setUser({ name: "Admin", role: "superuser" });
    flushPendingSync();
    expect(root.querySelector("#name")?.textContent).toBe("Admin");
    dispose();
    root.remove();
  });
}, { sanitizeOps: false, sanitizeResources: false });

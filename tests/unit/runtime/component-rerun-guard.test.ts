/**
 * P1-view-rerun-fetch-guard: non-route updates must not whole-tree remount a child
 * whose setup merely reads Signals (those reads are untracked at the component boundary).
 */
import "../dom-setup.ts";
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import {
  createContext,
  createSignal,
  useContext,
} from "@dreamer/view/reactivity";
import { jsx } from "@dreamer/view/jsx-runtime";
import { mount } from "@dreamer/view/csr";
import {
  clearComponentSetupNotes,
  detectComponentRerun,
  detectOversubscribe,
  installComponentSetupTracking,
  isComponentSetupTracking,
  listComponentSetupKeys,
  uninstallComponentSetupTracking,
} from "@dreamer/view/devtools";
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

  it("jsx-runtime eager {user.name} stays fine-grained under setup untrack", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const UserContext = createContext({ name: "Guest", role: "none" });
    let setUser!: (v: { name: string; role: string }) => void;
    let setups = 0;

    function UserProfile() {
      setups++;
      const user = useContext(UserContext) as { name: string; role: string };
      // esbuild react-jsx evaluates user.name before jsx(); Proxy must defer
      // a __VIEW_SIGNAL thunk when there is no Observer (setup untrack).
      return jsx("div", {
        id: "profile",
        children: jsx("span", {
          id: "name",
          children: user.name,
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
    const profile = root.querySelector("#profile");
    expect(root.querySelector("#name")?.textContent).toBe("Guest");
    expect(setups).toBe(1);
    setUser({ name: "Admin", role: "superuser" });
    flushPendingSync();
    expect(root.querySelector("#profile")).toBe(profile);
    expect(root.querySelector("#name")?.textContent).toBe("Admin");
    expect(setups).toBe(1);
    dispose();
    root.remove();
  });
}, { sanitizeOps: false, sanitizeResources: false });


describe("runtime/jsx-dev-rerun-note (P1)", () => {
  const g = globalThis as { VIEW_DEV?: boolean };
  let prevDev: boolean | undefined;

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    clearComponentSetupNotes();
    uninstallComponentSetupTracking();
  });

  afterEach(() => {
    clearComponentSetupNotes();
    uninstallComponentSetupTracking();
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("installComponentSetupTracking is VIEW_DEV-gated", () => {
    g.VIEW_DEV = false;
    installComponentSetupTracking();
    expect(isComponentSetupTracking()).toBe(false);
    g.VIEW_DEV = true;
    installComponentSetupTracking();
    expect(isComponentSetupTracking()).toBe(true);
  });

  it("jsx auto-notes named function components without manual noteComponentSetup", () => {
    installComponentSetupTracking();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const [page, setPage] = createSignal("a");

    function TrackedChild(props: { page: string }) {
      return jsx("div", { id: "child", "data-page": props.page });
    }

    function Parent() {
      // Parent thunk re-reads page → Child remounts (route-like)
      return () => jsx(TrackedChild, { page: page() });
    }

    const dispose = mount(() => jsx(Parent, {}), root);
    expect(listComponentSetupKeys()).toContain("TrackedChild");
    expect(listComponentSetupKeys()).toContain("Parent");
    expect(detectComponentRerun("TrackedChild")).toBeNull();

    setPage("b");
    flushPendingSync();

    const hit = detectComponentRerun("TrackedChild");
    expect(hit).not.toBeNull();
    expect(hit!.kind).toBe("component-rerun");
    expect(hit!.setups).toBeGreaterThanOrEqual(2);

    // detectOversubscribe picks auto-noted keys without setupKeys
    const owner = null; // wide scan N/A; still merges setup map
    const warnings = detectOversubscribe(owner, {});
    expect(warnings.some((w) => w.kind === "component-rerun" && w.key === "TrackedChild"))
      .toBe(true);

    dispose();
    root.remove();
  });

  it("anonymous components are not auto-noted (avoid Anonymous collisions)", () => {
    installComponentSetupTracking();
    const root = document.createElement("div");
    document.body.appendChild(root);

    const Anon = () => jsx("div", { id: "anon" });
    // Wipe engine-assigned name if any — force empty for the assertion.
    Object.defineProperty(Anon, "name", { value: "" });

    const dispose = mount(() => jsx(Anon, {}), root);
    expect(listComponentSetupKeys()).not.toContain("Anonymous");
    expect(listComponentSetupKeys()).not.toContain("");
    expect(root.querySelector("#anon")).toBeTruthy();

    dispose();
    root.remove();
  });

  it("production path: no hook → jsx does not note", () => {
    // VIEW_DEV on but hook not installed
    const root = document.createElement("div");
    document.body.appendChild(root);
    function Named() {
      return jsx("span", { id: "n" });
    }
    const dispose = mount(() => jsx(Named, {}), root);
    expect(listComponentSetupKeys()).toEqual([]);
    dispose();
    root.remove();
  });
}, { sanitizeOps: false, sanitizeResources: false });


describe("runtime/props-signal-thunk (P1)", () => {
  it("eager {props.user.name} stays fine-grained for Signal-of-object props", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    let setups = 0;
    let setUser!: (v: { name: string; role: string }) => void;

    function UserCard(props: { user: { name: string; role: string } }) {
      setups++;
      // Same as Context: esbuild evaluates props.user.name before jsx/insert.
      // wrapComponentProps must return __VIEW_SIGNAL thunk under setup untrack.
      return jsx("div", {
        id: "card",
        children: jsx("span", {
          id: "name",
          children: props.user.name,
        }),
      });
    }

    function Demo() {
      const [user, set] = createSignal({ name: "Guest", role: "none" });
      setUser = set;
      return jsx(UserCard as never, { user });
    }

    const dispose = mount(() => jsx(Demo as never, {}), root);
    const card = root.querySelector("#card");
    expect(root.querySelector("#name")?.textContent).toBe("Guest");
    expect(setups).toBe(1);

    setUser({ name: "Admin", role: "superuser" });
    flushPendingSync();

    expect(root.querySelector("#card")).toBe(card);
    expect(root.querySelector("#name")?.textContent).toBe("Admin");
    expect(setups).toBe(1);

    dispose();
    root.remove();
  });

  it("eager {user.name} via const user = props.user also fine-grains", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    let setUser!: (v: { name: string }) => void;
    let setups = 0;

    function Profile(props: { user: { name: string } }) {
      setups++;
      const user = props.user;
      return jsx("span", { id: "n", children: user.name });
    }

    function Demo() {
      const [user, set] = createSignal({ name: "A" });
      setUser = set;
      return jsx(Profile as never, { user });
    }

    const dispose = mount(() => jsx(Demo as never, {}), root);
    expect(root.querySelector("#n")?.textContent).toBe("A");
    setUser({ name: "B" });
    flushPendingSync();
    expect(root.querySelector("#n")?.textContent).toBe("B");
    expect(setups).toBe(1);
    dispose();
    root.remove();
  });

  it("primitive Signal prop stays as getter for insert children", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    let setN!: (v: number) => void;
    let setups = 0;

    function Counter(props: { n: number }) {
      setups++;
      return jsx("span", { id: "c", children: props.n as unknown as never });
    }

    function Demo() {
      const [n, set] = createSignal(0);
      setN = set;
      return jsx(Counter as never, { n });
    }

    const dispose = mount(() => jsx(Demo as never, {}), root);
    expect(root.querySelector("#c")?.textContent).toBe("0");
    setN(2);
    flushPendingSync();
    expect(root.querySelector("#c")?.textContent).toBe("2");
    expect(setups).toBe(1);
    dispose();
    root.remove();
  });
}, { sanitizeOps: false, sanitizeResources: false });

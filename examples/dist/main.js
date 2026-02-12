// ../src/scheduler.ts
var queue = /* @__PURE__ */ new Set();
var queueCopy = [];
var scheduled = false;
function flushQueue() {
  scheduled = false;
  queueCopy.length = 0;
  for (const run of queue) queueCopy.push(run);
  queue.clear();
  for (const run of queueCopy) run();
}
function schedule(run) {
  queue.add(run);
  if (!scheduled) {
    scheduled = true;
    if (typeof globalThis.queueMicrotask !== "undefined") {
      globalThis.queueMicrotask(flushQueue);
    } else if (typeof Promise !== "undefined") {
      Promise.resolve().then(flushQueue);
    } else {
      setTimeout(flushQueue, 0);
    }
  }
}
function unschedule(run) {
  queue.delete(run);
}

// ../src/signal.ts
var currentEffect = null;
function setCurrentEffect(effect) {
  currentEffect = effect;
}
function getCurrentEffect() {
  return currentEffect;
}
function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = /* @__PURE__ */ new Set();
  const getter = () => {
    if (currentEffect) {
      subscribers.add(currentEffect);
      if (currentEffect._subscriptionSets) {
        currentEffect._subscriptionSets.push(subscribers);
      }
    }
    return value;
  };
  const setter = (next) => {
    const nextValue = typeof next === "function" ? next(value) : next;
    if (Object.is(value, nextValue)) {
      return;
    }
    value = nextValue;
    subscribers.forEach((run) => schedule(run));
  };
  return [markSignalGetter(getter), setter];
}
var SIGNAL_GETTER_MARKER = /* @__PURE__ */ Symbol.for("view.signalGetter");
function markSignalGetter(getter) {
  getter[SIGNAL_GETTER_MARKER] = true;
  return getter;
}
function isSignalGetter(fn) {
  return typeof fn === "function" && fn[SIGNAL_GETTER_MARKER] === true;
}

// ../src/effect.ts
var currentScope = null;
function setCurrentScope(scope) {
  currentScope = scope;
}
function scheduleEffect(run) {
  schedule(run);
}
function onCleanup(cb) {
  const run = getCurrentEffect();
  if (run?._cleanups) run._cleanups.push(cb);
}
function runCleanups(run) {
  const list2 = run._cleanups;
  if (list2) {
    for (const cb of list2) cb();
    list2.length = 0;
  }
}
function createEffect(fn) {
  let disposed = false;
  const run = () => {
    if (disposed) return;
    runCleanups(run);
    const subs = run._subscriptionSets;
    if (subs) {
      for (const s of subs) s.delete(run);
      subs.length = 0;
    }
    run._cleanups = [];
    const prev = getCurrentEffect();
    run._subscriptionSets = [];
    setCurrentEffect(run);
    try {
      const nextDispose = fn();
      if (typeof nextDispose === "function") {
        run._cleanups.push(nextDispose);
      }
    } finally {
      setCurrentEffect(prev);
    }
  };
  const schedule2 = () => {
    if (disposed) return;
    runCleanups(run);
    scheduleEffect(run);
  };
  run._subscriptionSets = [];
  run._cleanups = [];
  run();
  const disposer = () => {
    if (disposed) return;
    disposed = true;
    const runWithSubs = run;
    const subs = runWithSubs._subscriptionSets;
    if (subs) {
      for (const s of subs) s.delete(run);
      subs.length = 0;
    }
    runCleanups(runWithSubs);
    unschedule(schedule2);
  };
  if (currentScope) currentScope.addDisposer(disposer);
  return disposer;
}
function createMemo(fn) {
  const [get3, set] = createSignal(void 0);
  createEffect(() => set(fn()));
  return markSignalGetter(get3);
}

// ../src/dom/shared.ts
var FragmentType = /* @__PURE__ */ Symbol.for("view.fragment");
function isFragment(vnode) {
  return vnode.type === FragmentType || vnode.type === "Fragment";
}
function isVNodeLike(x) {
  return typeof x === "object" && x !== null && "type" in x && "props" in x;
}

// ../src/dom/unmount.ts
function registerDirectiveUnmount(el, cb) {
  const viewEl = el;
  const list2 = viewEl.__viewDirectiveUnmount;
  if (list2) list2.push(cb);
  else viewEl.__viewDirectiveUnmount = [cb];
}
function runDirectiveUnmountOnChildren(parent) {
  for (const child of Array.from(parent.childNodes)) {
    runDirectiveUnmount(child);
  }
}
function runDirectiveUnmount(node) {
  if (node.nodeType === 1) {
    const el = node;
    runDirectiveUnmountOnChildren(el);
    const list2 = el.__viewDirectiveUnmount;
    if (list2) {
      for (const cb of list2) cb();
      list2.length = 0;
    }
  } else if (node.nodeType === 11) {
    const frag = node;
    runDirectiveUnmountOnChildren(frag);
  }
}

// ../src/types.ts
function isDOMEnvironment() {
  return typeof globalThis !== "undefined" && typeof globalThis.document !== "undefined";
}

// ../src/jsx-runtime.ts
var Fragment = FragmentType;
function normalizeProps(props, maybeKey) {
  const p = props ?? {};
  const key = (maybeKey !== void 0 && maybeKey !== null ? maybeKey : p.key) ?? null;
  const { key: _k, ...rest } = p;
  return { props: rest, key: key ?? void 0 };
}
function jsx(type, props, maybeKey) {
  const { props: p, key } = normalizeProps(props, maybeKey);
  return { type, props: p, key, children: p.children };
}
function jsxs(type, props, maybeKey) {
  const { props: p, key } = normalizeProps(props, maybeKey);
  return { type, props: p, key, children: p.children };
}

// ../src/boundary.ts
function valueOf(v) {
  return typeof v === "function" ? v() : v;
}
function isErrorBoundary(component) {
  return component === ErrorBoundary;
}
function getErrorBoundaryFallback(props) {
  const fb = props.fallback;
  if (typeof fb === "function") return fb;
  const vnode = fb != null && typeof fb === "object" && "type" in fb ? fb : { type: "#text", props: { nodeValue: String(fb) }, children: [] };
  return () => vnode;
}
function ErrorBoundary(props) {
  return props.children ?? null;
}
function Suspense(props) {
  const [resolved, setResolved] = createSignal(null);
  let generation = 0;
  createEffect(() => {
    const gen = ++generation;
    const c = valueOf(props.children);
    if (c != null && typeof c.then === "function") {
      c.then((v) => {
        if (gen === generation) setResolved(v ?? null);
      });
    } else {
      setResolved(c ?? null);
    }
    return () => {
      generation = -1;
    };
  });
  const getter = () => resolved() ?? valueOf(props.fallback);
  return jsx(Fragment, { children: markSignalGetter(getter) });
}

// ../src/directive.ts
var registry = /* @__PURE__ */ new Map();
function directiveNameToCamel(name2) {
  if (name2.startsWith("v-")) {
    const rest = name2.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return "v" + rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return name2;
}
function directiveNameToKebab(name2) {
  if (name2.startsWith("v") && name2.length > 1) {
    const rest = name2.slice(1).replace(
      /([A-Z])/g,
      (_, c) => `-${c.toLowerCase()}`
    );
    return "v" + rest;
  }
  return name2;
}
function registerDirective(name2, hooks) {
  const camel = directiveNameToCamel(name2);
  registry.set(camel, hooks);
  if (camel !== name2) registry.set(name2, hooks);
}
function getDirective(propKey) {
  if (!propKey.startsWith("v") && !propKey.startsWith("v-")) return void 0;
  return registry.get(propKey) ?? registry.get(directiveNameToCamel(propKey));
}
var BUILTIN_DIRECTIVE_PROPS = /* @__PURE__ */ new Set([
  "vIf",
  "v-if",
  "vElse",
  "v-else",
  "vElseIf",
  "v-else-if",
  "vFor",
  "v-for",
  "vShow",
  "v-show",
  "vText",
  "v-text",
  "vHtml",
  "v-html",
  "vModel",
  "v-model",
  "vOnce",
  "v-once",
  "vCloak",
  "v-cloak"
]);
function isDirectiveProp(propKey) {
  if (BUILTIN_DIRECTIVE_PROPS.has(propKey)) return true;
  if (propKey.startsWith("v") && propKey.length > 1 || propKey.startsWith("v-")) {
    return true;
  }
  return false;
}
function hasDirective(props, camelName) {
  if (camelName in props) return true;
  const kebab = directiveNameToKebab(camelName);
  return kebab in props;
}
function getDirectiveValue(value) {
  return isSignalGetter(value) ? value() : value;
}
function createBinding(value, arg, modifiers) {
  return {
    value: getDirectiveValue(value),
    arg,
    modifiers: modifiers ?? []
  };
}
function hasStructuralDirective(props) {
  if ("vIf" in props || "v-if" in props) return "vIf";
  if ("vFor" in props || "v-for" in props) return "vFor";
  return null;
}
function getVIfValue(props) {
  const raw = props["vIf"] ?? props["v-if"];
  if (raw == null) return true;
  const v = typeof raw === "function" ? raw() : getDirectiveValue(raw);
  return Boolean(v);
}
function getVElseShow(lastVIf) {
  return !lastVIf;
}
function getVElseIfValue(props) {
  const raw = props["vElseIf"] ?? props["v-else-if"];
  if (raw == null) return false;
  const v = typeof raw === "function" ? raw() : getDirectiveValue(raw);
  return Boolean(v);
}
function resolveVForFactory(children) {
  if (typeof children === "function") {
    return children;
  }
  if (Array.isArray(children) && children.length === 1 && typeof children[0] === "function") {
    return children[0];
  }
  return () => children;
}
function getVForListAndFactory(props, children) {
  const rawList = props["vFor"] ?? props["v-for"];
  if (rawList == null) return null;
  const resolved = getDirectiveValue(rawList);
  const list2 = Array.isArray(resolved) ? resolved : [];
  const factory = resolveVForFactory(children);
  return { list: list2, factory };
}
function getVShowValue(props) {
  const raw = props["vShow"] ?? props["v-show"];
  if (raw == null) return true;
  return Boolean(getDirectiveValue(raw));
}
function getVTextValue(props) {
  const raw = props["vText"] ?? props["v-text"];
  if (raw == null) return "";
  const v = typeof raw === "function" ? raw() : getDirectiveValue(raw);
  return v == null ? "" : String(v);
}
function getVHtmlValue(props) {
  const raw = props["vHtml"] ?? props["v-html"];
  if (raw == null) return "";
  const v = typeof raw === "function" ? raw() : getDirectiveValue(raw);
  return v == null ? "" : String(v);
}
function applyDirectives(el, props, effectFn, registerUnmount) {
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key") continue;
    if (BUILTIN_DIRECTIVE_PROPS.has(key)) continue;
    const directive = getDirective(key);
    if (!directive) continue;
    const binding = createBinding(value);
    if (directive.mounted) {
      directive.mounted(el, binding);
    }
    if (directive.updated && isSignalGetter(value)) {
      effectFn(() => {
        const current = createBinding(value);
        directive.updated(el, current);
      });
    }
    if (directive.unmounted && registerUnmount) {
      registerUnmount(el, () => directive.unmounted(el));
    }
  }
}

// ../src/context.ts
var contextStacks = /* @__PURE__ */ new Map();
var defaultValues = /* @__PURE__ */ new Map();
var providerBindings = /* @__PURE__ */ new Map();
function pushContext(id, value) {
  let stack = contextStacks.get(id);
  if (!stack) {
    stack = [];
    contextStacks.set(id, stack);
  }
  stack.push(value);
}
function popContext(id) {
  const stack = contextStacks.get(id);
  if (stack && stack.length > 0) stack.pop();
}
function getContext(id) {
  const stack = contextStacks.get(id);
  const value = stack && stack.length > 0 ? stack[stack.length - 1] : void 0;
  return value !== void 0 ? value : defaultValues.get(id);
}
function getContextBinding(component, props) {
  const binding = providerBindings.get(component);
  if (!binding) return void 0;
  return { id: binding.id, value: binding.getValue(props) };
}
function createContext(defaultValue) {
  const id = /* @__PURE__ */ Symbol("view.context");
  defaultValues.set(id, defaultValue);
  const Provider = (props) => {
    return props.children ?? null;
  };
  providerBindings.set(
    Provider,
    { id, getValue: (p) => p.value }
  );
  const useContext = () => {
    return getContext(id);
  };
  const registerProviderAlias = (component, getValue) => {
    providerBindings.set(component, {
      id,
      getValue
    });
  };
  return { Provider, useContext, registerProviderAlias };
}

// ../src/dom/props.ts
function applyRef(el, ref) {
  if (ref == null) return;
  if (typeof ref === "function") {
    ref(el);
    return;
  }
  if (typeof ref === "object" && "current" in ref) {
    ref.current = el;
  }
}
function applyProps(el, props) {
  if (!isDOMEnvironment()) return;
  if (hasDirective(props, "vShow")) {
    const raw = props["vShow"] ?? props["v-show"];
    const apply = () => {
      const show2 = getVShowValue(props);
      el.style.display = show2 ? "" : "none";
    };
    if (isSignalGetter(raw)) {
      createEffect(apply);
    } else {
      apply();
    }
  }
  if (hasDirective(props, "vText")) {
    const raw = props["vText"] ?? props["v-text"];
    const apply = () => {
      const text = getVTextValue(props);
      el.textContent = text;
    };
    if (typeof raw === "function" || isSignalGetter(raw)) {
      createEffect(apply);
    } else {
      apply();
    }
  }
  if (hasDirective(props, "vHtml")) {
    const raw = props["vHtml"] ?? props["v-html"];
    const apply = () => {
      const html2 = getVHtmlValue(props);
      el.innerHTML = html2;
    };
    if (typeof raw === "function" || isSignalGetter(raw)) {
      createEffect(apply);
    } else {
      apply();
    }
  }
  if (hasDirective(props, "vCloak")) {
    el.setAttribute("data-view-cloak", "");
  }
  if (hasDirective(props, "vModel")) {
    const raw = props["vModel"] ?? props["v-model"];
    if (Array.isArray(raw) && raw.length >= 2 && typeof raw[0] === "function" && typeof raw[1] === "function") {
      const getter = raw[0];
      const setter = raw[1];
      const tag = el.tagName;
      const inputEl = el;
      const textareaEl = el;
      const selectEl = el;
      const inputType = String((props.type ?? inputEl.type) || "text").toLowerCase();
      if (tag === "INPUT") {
        const type = inputType;
        if (type === "checkbox") {
          const apply = () => {
            inputEl.checked = Boolean(getter());
          };
          if (isSignalGetter(getter)) {
            createEffect(apply);
          } else {
            apply();
          }
          el.addEventListener("change", () => setter(inputEl.checked));
        } else if (type === "radio") {
          const apply = () => {
            inputEl.checked = getter() === inputEl.value;
          };
          if (isSignalGetter(getter)) {
            createEffect(apply);
          } else {
            apply();
          }
          el.addEventListener("change", () => setter(inputEl.value));
        } else {
          const apply = () => {
            if (isFocusedFormElement(inputEl)) return;
            const v = getter();
            const str = v == null ? "" : String(v);
            if (inputEl.value !== str) inputEl.value = str;
          };
          if (isSignalGetter(getter)) {
            createEffect(apply);
          } else {
            apply();
          }
          el.addEventListener("input", () => setter(inputEl.value));
        }
      } else if (tag === "TEXTAREA") {
        const apply = () => {
          if (isFocusedFormElement(textareaEl)) return;
          const v = getter();
          const str = v == null ? "" : String(v);
          if (textareaEl.value !== str) textareaEl.value = str;
        };
        if (isSignalGetter(getter)) {
          createEffect(apply);
        } else {
          apply();
        }
        el.addEventListener("input", () => setter(textareaEl.value));
      } else if (tag === "SELECT") {
        const apply = () => {
          if (isFocusedFormElement(selectEl)) return;
          const v = getter();
          const str = v == null ? "" : String(v);
          if (selectEl.value !== str) selectEl.value = str;
        };
        if (isSignalGetter(getter)) {
          createEffect(apply);
        } else {
          apply();
        }
        el.addEventListener("change", () => setter(selectEl.value));
      }
    }
  }
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key") continue;
    if (isDirectiveProp(key)) continue;
    if (key === "value" && hasDirective(props, "vModel")) continue;
    if (key === "checked" && hasDirective(props, "vModel")) continue;
    if (key === "ref") {
      if (isSignalGetter(value)) {
        createEffect(() => {
          const v = value();
          applyRef(el, v);
        });
      } else {
        applyRef(el, value);
      }
      continue;
    }
    if (key === "dangerouslySetInnerHTML" && value != null && typeof value === "object") {
      const inner = value.__html;
      if (inner != null) {
        el.innerHTML = inner;
      }
      continue;
    }
    if (isSignalGetter(value)) {
      createEffect(() => {
        applySingleProp(el, key, value());
      });
      continue;
    }
    if (key === "value" && typeof value === "function") {
      createEffect(() => {
        applySingleProp(el, key, value());
      });
      continue;
    }
    if (key === "checked" && typeof value === "function") {
      createEffect(() => {
        applySingleProp(el, key, value());
      });
      continue;
    }
    applySingleProp(el, key, value);
  }
  applyDirectives(el, props, createEffect, registerDirectiveUnmount);
}
var VIEW_EVENT_KEY_PREFIX = "__view$on:";
function isFocusedFormElement(el) {
  if (typeof globalThis.document === "undefined") return false;
  const active = globalThis.document.activeElement;
  if (!active) return false;
  return active === el || el.contains(active);
}
function applySingleProp(el, key, value) {
  const viewEl = el;
  if (key.startsWith("on") && key.length > 2) {
    const event = key.slice(2).toLowerCase();
    const storageKey = VIEW_EVENT_KEY_PREFIX + event;
    const prev = viewEl[storageKey];
    if (typeof prev === "function") {
      el.removeEventListener(event, prev);
      viewEl[storageKey] = void 0;
    }
    if (typeof value === "function") {
      const fn = value;
      viewEl[storageKey] = fn;
      el.addEventListener(event, fn);
    }
    return;
  }
  if (key === "className") {
    const classVal = value == null ? "" : String(value);
    if (el.namespaceURI === "http://www.w3.org/2000/svg") {
      el.setAttribute("class", classVal);
    } else {
      el.className = classVal;
    }
    return;
  }
  if (key === "style" && value != null) {
    const style = el.style;
    if (typeof value === "string") {
      style.cssText = value;
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        style[k] = v == null ? "" : String(v);
      }
    }
    return;
  }
  if (key === "innerHTML") {
    el.innerHTML = value == null ? "" : String(value);
    return;
  }
  if (value == null || value === false) {
    el.removeAttribute(key);
    if (key === "disabled" || key === "readOnly" || key === "multiple" || key === "selected" || key === "checked") {
      viewEl[key] = false;
    }
    return;
  }
  if (value === true) {
    el.setAttribute(key, "");
    if (key === "disabled" || key === "readOnly" || key === "multiple" || key === "selected" || key === "checked") {
      viewEl[key] = true;
    }
    return;
  }
  const str = String(value);
  if (key === "value") {
    const formEl = el;
    if (isFocusedFormElement(el)) return;
    formEl.value = str;
    return;
  }
  if (key === "checked" || key === "selected") {
    viewEl[key] = Boolean(value);
    el.setAttribute(key, str);
    return;
  }
  if (key === "disabled" || key === "readOnly" || key === "multiple") {
    viewEl[key] = Boolean(value);
  }
  const attrName = key === "htmlFor" ? "for" : key;
  el.setAttribute(attrName, str);
}

// ../src/dom/element.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var KEYED_WRAPPER_ATTR = "data-view-keyed";
function freezeVNodeForOnce(vnode) {
  const props = vnode.props;
  const frozenProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === "vOnce" || k === "v-once") continue;
    frozenProps[k] = isSignalGetter(v) ? getDirectiveValue(v) : v;
  }
  frozenProps.children = freezeChildrenForOnce(
    props.children ?? vnode.children
  );
  return { type: vnode.type, props: frozenProps, key: vnode.key, children: [] };
}
function freezeChildrenForOnce(raw) {
  if (isSignalGetter(raw)) {
    return freezeChildrenForOnce(getDirectiveValue(raw));
  }
  if (Array.isArray(raw)) {
    return raw.map((c) => freezeChildrenForOnce(c));
  }
  if (raw != null && typeof raw === "object" && "type" in raw) {
    return freezeVNodeForOnce(raw);
  }
  return raw;
}
function resolveNamespace(tag, parentNamespace) {
  if (parentNamespace === SVG_NS) return SVG_NS;
  if (tag === "svg") return SVG_NS;
  return null;
}
function normalizeChildren(children) {
  if (children == null) return [];
  if (isSignalGetter(children)) {
    return [children];
  }
  if (typeof children === "function") {
    return [children];
  }
  if (Array.isArray(children)) {
    const out = [];
    for (const c of children) {
      const items = normalizeChildren(c);
      for (const item of items) out.push(item);
    }
    return out;
  }
  if (typeof children === "object" && children !== null && "type" in children && "props" in children) {
    return [children];
  }
  return [{
    type: "#text",
    props: { nodeValue: String(children) },
    children: []
  }];
}
function hasAnyKey(items) {
  for (const x of items) {
    if (!isSignalGetter(x) && x.key != null) return true;
  }
  return false;
}
function reconcileKeyedChildren(container2, items, parentNamespace, ifContext) {
  const doc = globalThis.document;
  const keyToWrapper = /* @__PURE__ */ new Map();
  for (const child of Array.from(container2.children)) {
    const key = child.getAttribute?.("data-key");
    if (key != null) keyToWrapper.set(key, child);
  }
  const resultNodes = [];
  const ctx = ifContext ?? { lastVIf: true };
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (isSignalGetter(item)) {
      const wrap = doc.createElement("span");
      wrap.setAttribute("data-view-dynamic", "");
      appendDynamicChild(wrap, item, parentNamespace, ctx);
      resultNodes.push(wrap);
      continue;
    }
    const v = item;
    const key = v.key != null ? String(v.key) : `@${i}`;
    let wrapper = keyToWrapper.get(key);
    if (wrapper) {
      keyToWrapper.delete(key);
      runDirectiveUnmountOnChildren(wrapper);
      wrapper.replaceChildren(createElement(v, parentNamespace, ctx));
      resultNodes.push(wrapper);
    } else {
      wrapper = doc.createElement("span");
      wrapper.setAttribute(KEYED_WRAPPER_ATTR, "");
      wrapper.setAttribute("data-key", key);
      wrapper.appendChild(createElement(v, parentNamespace, ctx));
      resultNodes.push(wrapper);
    }
  }
  runDirectiveUnmountOnChildren(container2);
  container2.replaceChildren(...resultNodes);
}
function appendDynamicChild(parent, getter, parentNamespace, ifContext) {
  const doc = globalThis.document;
  const placeholder = doc.createElement("span");
  placeholder.setAttribute("data-view-dynamic", "");
  parent.appendChild(placeholder);
  createEffect(() => {
    const value = getter();
    const items = normalizeChildren(value);
    const ctx = ifContext ?? { lastVIf: true };
    if (items.length > 0 && hasAnyKey(items)) {
      reconcileKeyedChildren(
        placeholder,
        items,
        parentNamespace,
        ctx
      );
      return;
    }
    const frag = doc.createDocumentFragment();
    for (const v of items) {
      if (isSignalGetter(v)) {
        const inner = doc.createElement("span");
        inner.setAttribute("data-view-dynamic", "");
        frag.appendChild(inner);
        appendDynamicChild(inner, v, parentNamespace, ctx);
      } else {
        frag.appendChild(createElement(v, parentNamespace, ctx));
      }
    }
    runDirectiveUnmountOnChildren(placeholder);
    placeholder.replaceChildren(frag);
  });
}
function collectVIfGroup(list2, startIndex) {
  const first = list2[startIndex];
  if (isSignalGetter(first)) return [];
  const v0 = first;
  const vIfRaw = v0.props["vIf"] ?? v0.props["v-if"];
  const isReactiveVIf = typeof vIfRaw === "function" || isSignalGetter(vIfRaw);
  if (!hasDirective(v0.props, "vIf") || !isReactiveVIf) return [];
  const group = [v0];
  for (let i = startIndex + 1; i < list2.length; i++) {
    const it = list2[i];
    if (isSignalGetter(it)) break;
    const v = it;
    if (hasDirective(v.props, "vElseIf") || hasDirective(v.props, "vElse")) {
      group.push(v);
    } else {
      break;
    }
  }
  return group;
}
function createVIfGroupPlaceholder(group, parentNamespace, ifContext) {
  const doc = globalThis.document;
  const placeholder = doc.createElement("span");
  placeholder.setAttribute("data-view-v-if-group", "");
  createEffect(() => {
    let showIndex = -1;
    for (let i = 0; i < group.length; i++) {
      const v = group[i];
      const props = v.props;
      if (i === 0) {
        if (getVIfValue(props)) {
          showIndex = i;
          break;
        }
      } else if (hasDirective(props, "vElse")) {
        showIndex = i;
        break;
      } else if (hasDirective(props, "vElseIf")) {
        if (getVElseIfValue(props)) {
          showIndex = i;
          break;
        }
      }
    }
    runDirectiveUnmountOnChildren(placeholder);
    placeholder.replaceChildren();
    if (showIndex >= 0) {
      const chosen = group[showIndex];
      const stripProps = { ...chosen.props };
      delete stripProps.vIf;
      delete stripProps["v-if"];
      delete stripProps.vElseIf;
      delete stripProps["v-else-if"];
      delete stripProps.vElse;
      delete stripProps["v-else"];
      const next = createElement(
        { ...chosen, props: stripProps },
        parentNamespace,
        ifContext
      );
      placeholder.appendChild(next);
    }
  });
  return placeholder;
}
function appendChildren(parent, rawChildren, parentNamespace, ifContext) {
  if (!isDOMEnvironment()) return;
  const ctx = ifContext ?? { lastVIf: true };
  if (typeof rawChildren === "function" || isSignalGetter(rawChildren)) {
    appendDynamicChild(
      parent,
      rawChildren,
      parentNamespace,
      ctx
    );
    return;
  }
  const list2 = normalizeChildren(rawChildren);
  let i = 0;
  while (i < list2.length) {
    const item = list2[i];
    if (typeof item === "function" || isSignalGetter(item)) {
      appendDynamicChild(parent, item, parentNamespace, ctx);
      i++;
      continue;
    }
    const vnode = item;
    const vIfRaw = vnode.props["vIf"] ?? vnode.props["v-if"];
    const isDynamicVIf = hasDirective(vnode.props, "vIf") && (typeof vIfRaw === "function" || isSignalGetter(vIfRaw));
    if (isDynamicVIf) {
      const group = collectVIfGroup(list2, i);
      if (group.length > 0) {
        parent.appendChild(
          createVIfGroupPlaceholder(group, parentNamespace, ctx)
        );
        i += group.length;
        continue;
      }
    }
    parent.appendChild(createElement(vnode, parentNamespace, ctx));
    i++;
  }
}
function createElement(vnode, parentNamespace = null, ifContext) {
  const doc = globalThis.document;
  if (isFragment(vnode)) {
    const frag = doc.createDocumentFragment();
    const rawChildren = vnode.props.children ?? vnode.children;
    appendChildren(frag, rawChildren, parentNamespace, ifContext);
    return frag;
  }
  if (typeof vnode.type === "function") {
    const type = vnode.type;
    const props2 = vnode.props;
    const binding = getContextBinding(type, props2);
    if (binding) pushContext(binding.id, binding.value);
    try {
      let result;
      result = type(props2);
      if (result == null) return doc.createTextNode("");
      const nodes = Array.isArray(result) ? result : [result];
      if (nodes.length === 0) return doc.createTextNode("");
      if (isErrorBoundary(type)) {
        try {
          if (nodes.length === 1) {
            return createElement(nodes[0], parentNamespace, ifContext);
          }
          const frag2 = doc.createDocumentFragment();
          for (const n of nodes) {
            frag2.appendChild(createElement(n, parentNamespace, ifContext));
          }
          return frag2;
        } catch (e) {
          return createElement(getErrorBoundaryFallback(props2)(e));
        }
      }
      if (nodes.length === 1) {
        return createElement(nodes[0], parentNamespace, ifContext);
      }
      const frag = doc.createDocumentFragment();
      for (const n of nodes) {
        frag.appendChild(createElement(n, parentNamespace, ifContext));
      }
      return frag;
    } finally {
      if (binding) popContext(binding.id);
    }
  }
  const tag = vnode.type;
  if (tag === "#text") {
    return doc.createTextNode(
      String(vnode.props.nodeValue ?? "")
    );
  }
  const props = vnode.props;
  const structural = hasStructuralDirective(props);
  if (hasDirective(props, "vOnce")) {
    return createElement(
      freezeVNodeForOnce(vnode),
      parentNamespace,
      ifContext
    );
  }
  if (hasDirective(props, "vElse")) {
    if (ifContext && !getVElseShow(ifContext.lastVIf)) {
      return doc.createTextNode("");
    }
    if (ifContext) ifContext.lastVIf = true;
  }
  if (hasDirective(props, "vElseIf")) {
    if (ifContext && ifContext.lastVIf) {
      return doc.createTextNode("");
    }
    const elseIfShow = getVElseIfValue(props);
    if (!elseIfShow) {
      if (ifContext) ifContext.lastVIf = false;
      return doc.createTextNode("");
    }
    if (ifContext) ifContext.lastVIf = true;
  }
  if (structural === "vIf") {
    const vIfRaw = props["vIf"] ?? props["v-if"];
    const isReactiveVIf = typeof vIfRaw === "function" || isSignalGetter(vIfRaw);
    if (isReactiveVIf) {
      const placeholder = doc.createElement("span");
      placeholder.setAttribute("data-view-v-if", "");
      createEffect(() => {
        const show2 = getVIfValue(props);
        runDirectiveUnmountOnChildren(placeholder);
        placeholder.replaceChildren();
        if (show2) {
          const next = createElement(
            {
              ...vnode,
              props: { ...props, vIf: void 0, "v-if": void 0 }
            },
            parentNamespace,
            ifContext
          );
          placeholder.appendChild(next);
        }
        if (ifContext) ifContext.lastVIf = show2;
      });
      return placeholder;
    }
    if (!getVIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return doc.createTextNode("");
    }
    if (ifContext) ifContext.lastVIf = true;
  }
  if (structural === "vFor") {
    const rawChildren = props.children ?? vnode.children;
    const rawList = props["vFor"] ?? props["v-for"];
    const isReactiveVFor = typeof rawList === "function" || isSignalGetter(rawList);
    if (isReactiveVFor) {
      const placeholder = doc.createElement("span");
      placeholder.setAttribute("data-view-v-for", "");
      const templateProps = { ...props, vFor: void 0, "v-for": void 0 };
      const vForNs = resolveNamespace(tag, parentNamespace);
      const childNs = vForNs ?? (tag === "svg" ? SVG_NS : null);
      createEffect(() => {
        const resolved = typeof rawList === "function" ? rawList() : rawList();
        const list2 = Array.isArray(resolved) ? resolved : [];
        const factory = resolveVForFactory(rawChildren);
        const frag = doc.createDocumentFragment();
        for (let i = 0; i < list2.length; i++) {
          const item = list2[i];
          const childResult = factory(item, i);
          const childNodes = Array.isArray(childResult) ? childResult : [childResult];
          const first = childNodes[0];
          const itemVnode = {
            type: tag,
            props: {
              ...templateProps,
              children: childNodes.length === 1 ? childNodes[0] : childNodes
            },
            key: first?.key != null ? first.key : i
          };
          frag.appendChild(createElement(itemVnode, childNs, ifContext));
        }
        runDirectiveUnmountOnChildren(placeholder);
        placeholder.replaceChildren(frag);
      });
      return placeholder;
    }
    const parsed = getVForListAndFactory(props, rawChildren);
    if (parsed) {
      const { list: list2, factory } = parsed;
      const frag = doc.createDocumentFragment();
      const vForNs = resolveNamespace(tag, parentNamespace);
      const childNs = vForNs ?? (tag === "svg" ? SVG_NS : null);
      const templateProps = { ...props, vFor: void 0, "v-for": void 0 };
      for (let i = 0; i < list2.length; i++) {
        const item = list2[i];
        const childResult = factory(item, i);
        const childNodes = Array.isArray(childResult) ? childResult : [childResult];
        const first = childNodes[0];
        const itemVnode = {
          type: tag,
          props: {
            ...templateProps,
            children: childNodes.length === 1 ? childNodes[0] : childNodes
          },
          key: first?.key != null ? first.key : i
        };
        frag.appendChild(createElement(itemVnode, childNs, ifContext));
      }
      return frag;
    }
  }
  const ns = resolveNamespace(tag, parentNamespace);
  const el = ns ? doc.createElementNS(ns, tag) : doc.createElement(tag);
  if (vnode.key != null && vnode.key !== void 0) {
    el.setAttribute("data-key", String(vnode.key));
  }
  applyProps(el, props);
  if (!hasDirective(props, "vText") && !hasDirective(props, "vHtml")) {
    const rawChildren = props.children ?? vnode.children;
    appendChildren(
      el,
      rawChildren,
      ns ?? (tag === "svg" ? SVG_NS : null),
      ifContext
    );
  }
  return el;
}
function expandVNode(vnode) {
  if (isFragment(vnode)) {
    const rawChildren2 = vnode.props.children ?? vnode.children;
    const list3 = normalizeChildren(rawChildren2);
    const out = [];
    for (const item of list3) {
      if (isSignalGetter(item) || typeof item === "function") {
        out.push(item);
      } else {
        const expanded = expandVNode(item);
        if (Array.isArray(expanded)) {
          out.push(...expanded);
        } else {
          out.push(expanded);
        }
      }
    }
    return out;
  }
  if (typeof vnode.type === "function") {
    const type = vnode.type;
    const props2 = vnode.props;
    const binding = getContextBinding(type, props2);
    if (binding) pushContext(binding.id, binding.value);
    try {
      const result = type(props2);
      if (result == null) {
        return { type: "#text", props: { nodeValue: "" }, children: [] };
      }
      const nodes = Array.isArray(result) ? result : [result];
      if (nodes.length === 0) {
        return { type: "#text", props: { nodeValue: "" }, children: [] };
      }
      if (isErrorBoundary(type)) {
        try {
          if (nodes.length === 1) return expandVNode(nodes[0]);
          const out2 = [];
          for (const n of nodes) {
            const e = expandVNode(n);
            if (Array.isArray(e)) out2.push(...e);
            else out2.push(e);
          }
          return out2;
        } catch (e) {
          const fallbackVNode = getErrorBoundaryFallback(props2)(e);
          return fallbackVNode && typeof fallbackVNode === "object" && "type" in fallbackVNode ? expandVNode(fallbackVNode) : { type: "#text", props: { nodeValue: "" }, children: [] };
        }
      }
      if (nodes.length === 1) return expandVNode(nodes[0]);
      const out = [];
      for (const n of nodes) {
        const e = expandVNode(n);
        if (Array.isArray(e)) out.push(...e);
        else out.push(e);
      }
      return out;
    } finally {
      if (binding) popContext(binding.id);
    }
  }
  if (vnode.type === "#text") return vnode;
  const props = vnode.props;
  const rawChildren = props.children ?? vnode.children;
  const list2 = normalizeChildren(rawChildren);
  const newChildren = [];
  for (const item of list2) {
    if (isSignalGetter(item) || typeof item === "function") {
      newChildren.push(item);
    } else {
      const e = expandVNode(item);
      if (Array.isArray(e)) newChildren.push(...e);
      else newChildren.push(e);
    }
  }
  return {
    type: vnode.type,
    props: { ...props, children: newChildren },
    key: vnode.key,
    children: []
  };
}
function createNodeFromExpanded(expanded) {
  const doc = globalThis.document;
  if (Array.isArray(expanded)) {
    const frag = doc.createDocumentFragment();
    appendChildren(frag, expanded, null);
    return frag;
  }
  return createElement(expanded);
}
function reconcileChildren(parent, oldItems, newItems, parentNamespace, ifContext) {
  const doc = globalThis.document;
  for (let i = parent.childNodes.length - 1; i >= newItems.length; i--) {
    const node = parent.childNodes[i];
    runDirectiveUnmount(node);
    parent.removeChild(node);
  }
  const maxLen = Math.max(oldItems.length, newItems.length);
  for (let i = 0; i < maxLen; i++) {
    const newItem = newItems[i];
    const oldItem = oldItems[i];
    const existing = parent.childNodes[i];
    if (i >= newItems.length) continue;
    if (i >= oldItems.length || !existing) {
      const node = isSignalGetter(newItem) || typeof newItem === "function" ? (() => {
        const span = doc.createElement("span");
        span.setAttribute("data-view-dynamic", "");
        appendDynamicChild(
          span,
          newItem,
          parentNamespace,
          ifContext
        );
        return span;
      })() : createElement(newItem, parentNamespace, ifContext);
      if (i < parent.childNodes.length) {
        parent.insertBefore(node, parent.childNodes[i]);
      } else {
        parent.appendChild(node);
      }
      continue;
    }
    const newIsGetter = isSignalGetter(newItem) || typeof newItem === "function";
    const oldIsGetter = isSignalGetter(oldItem) || typeof oldItem === "function";
    if (newIsGetter || oldIsGetter) {
      runDirectiveUnmount(existing);
      parent.replaceChild(
        newIsGetter ? (() => {
          const span = doc.createElement("span");
          span.setAttribute("data-view-dynamic", "");
          appendDynamicChild(
            span,
            newItem,
            parentNamespace,
            ifContext
          );
          return span;
        })() : createElement(newItem, parentNamespace, ifContext),
        existing
      );
      continue;
    }
    patchNode(
      existing,
      oldItem,
      newItem,
      parentNamespace,
      ifContext
    );
  }
}
function patchNode(dom, oldV, newV, parentNamespace, ifContext) {
  if (oldV.type === "#text" && newV.type === "#text") {
    const newVal = String(
      newV.props.nodeValue ?? ""
    );
    if (dom.nodeValue !== newVal) dom.nodeValue = newVal;
    return;
  }
  if (oldV.type !== newV.type || String(oldV.key) !== String(newV.key)) {
    const parent = dom.parentNode;
    if (!parent) return;
    const next = createElement(newV, parentNamespace, ifContext);
    parent.replaceChild(next, dom);
    runDirectiveUnmount(dom);
    return;
  }
  if (typeof newV.type === "string" && newV.type !== "#text") {
    const el = dom;
    applyProps(el, newV.props);
    if (hasDirective(newV.props, "vText") || hasDirective(newV.props, "vHtml")) return;
    const oldChildren = normalizeChildren(
      oldV.props?.children ?? oldV.children ?? []
    );
    const newChildren = normalizeChildren(
      newV.props?.children ?? newV.children ?? []
    );
    const ns = resolveNamespace(newV.type, parentNamespace);
    reconcileChildren(
      el,
      oldChildren,
      newChildren,
      ns ?? (newV.type === "svg" ? SVG_NS : null),
      ifContext
    );
  }
}
var defaultIfContext = { lastVIf: true };
function patchRoot(container2, mounted, lastExpanded, newExpanded) {
  if (Array.isArray(lastExpanded) && Array.isArray(newExpanded)) {
    const oldItems = lastExpanded;
    const newItems = newExpanded;
    const frag = mounted;
    for (let i = frag.childNodes.length - 1; i >= newItems.length; i--) {
      const node = frag.childNodes[i];
      runDirectiveUnmount(node);
      frag.removeChild(node);
    }
    const maxLen = Math.max(oldItems.length, newItems.length);
    for (let i = 0; i < maxLen; i++) {
      const existing = frag.childNodes[i];
      const newItem = newItems[i];
      const oldItem = oldItems[i];
      if (i >= newItems.length) continue;
      const doc2 = globalThis.document;
      if (i >= oldItems.length || !existing) {
        const node = isSignalGetter(newItem) || typeof newItem === "function" ? (() => {
          const span = doc2.createElement("span");
          span.setAttribute("data-view-dynamic", "");
          appendDynamicChild(
            span,
            newItem,
            null,
            defaultIfContext
          );
          return span;
        })() : createElement(newItem);
        if (i < frag.childNodes.length) {
          frag.insertBefore(node, frag.childNodes[i]);
        } else {
          frag.appendChild(node);
        }
        continue;
      }
      const newIsGetter = isSignalGetter(newItem) || typeof newItem === "function";
      const oldIsGetter = isSignalGetter(oldItem) || typeof oldItem === "function";
      if (newIsGetter || oldIsGetter) {
        runDirectiveUnmount(existing);
        frag.replaceChild(
          newIsGetter ? (() => {
            const span = doc2.createElement("span");
            span.setAttribute("data-view-dynamic", "");
            appendDynamicChild(
              span,
              newItem,
              null,
              defaultIfContext
            );
            return span;
          })() : createElement(newItem),
          existing
        );
      } else {
        patchNode(
          existing,
          oldItem,
          newItem,
          null,
          defaultIfContext
        );
      }
    }
    return;
  }
  if (!Array.isArray(lastExpanded) && !Array.isArray(newExpanded)) {
    patchNode(mounted, lastExpanded, newExpanded, null, defaultIfContext);
    return;
  }
  const doc = globalThis.document;
  runDirectiveUnmount(mounted);
  const next = Array.isArray(newExpanded) ? (() => {
    const frag = doc.createDocumentFragment();
    appendChildren(frag, newExpanded, null, defaultIfContext);
    return frag;
  })() : createElement(newExpanded);
  container2.replaceChild(next, mounted);
}

// ../src/dom/stringify.ts
var voidElements = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
function escapeText(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function normalizeChildrenForSSR(children) {
  if (children == null) return [];
  if (isSignalGetter(children)) {
    return normalizeChildrenForSSR(children());
  }
  if (Array.isArray(children)) {
    const out = [];
    for (const c of children) {
      const items = normalizeChildrenForSSR(c);
      for (const v of items) out.push(v);
    }
    return out;
  }
  if (isVNodeLike(children)) {
    return [children];
  }
  return [{
    type: "#text",
    props: { nodeValue: String(children) },
    children: []
  }];
}
function stringifyAttributes(props) {
  const parts = [];
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key" || key === "ref" || key === "dangerouslySetInnerHTML") continue;
    if (key === "vCloak" || key === "v-cloak") {
      parts.push('data-view-cloak=""');
      continue;
    }
    if (isDirectiveProp(key)) continue;
    const v = isSignalGetter(value) ? value() : value;
    if (typeof v === "function") continue;
    if (v == null || v === false) continue;
    if (v === true) {
      parts.push(escapeAttr(key));
      continue;
    }
    let str;
    if (key === "style" && typeof v === "object" && v !== null) {
      str = Object.entries(v).map(
        ([k, val]) => `${k.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "")}: ${val == null ? "" : String(val)}`
      ).join("; ");
    } else {
      str = String(v);
    }
    if (key === "className") {
      parts.push(`class="${escapeAttr(str)}"`);
    } else if (key === "htmlFor") {
      parts.push(`for="${escapeAttr(str)}"`);
    } else {
      parts.push(`${escapeAttr(key)}="${escapeAttr(str)}"`);
    }
  }
  return parts.length ? " " + parts.join(" ") : "";
}
function createElementToString(vnode, ifContext, options) {
  if (isFragment(vnode)) {
    const ctx2 = ifContext ?? { lastVIf: true };
    const children = normalizeChildrenForSSR(
      vnode.props.children ?? vnode.children
    );
    return children.map((c) => createElementToString(c, ctx2, options)).join("");
  }
  if (typeof vnode.type === "function") {
    const type = vnode.type;
    const props2 = vnode.props;
    const binding = getContextBinding(type, props2);
    if (binding) pushContext(binding.id, binding.value);
    try {
      const result = type(props2);
      if (result == null) return "";
      const nodes = Array.isArray(result) ? result : [result];
      if (isErrorBoundary(type)) {
        try {
          return nodes.map((n) => createElementToString(n, ifContext, options)).join("");
        } catch (e) {
          return createElementToString(
            getErrorBoundaryFallback(props2)(e),
            ifContext,
            options
          );
        }
      }
      return nodes.map((n) => createElementToString(n, ifContext, options)).join("");
    } finally {
      if (binding) popContext(binding.id);
    }
  }
  const tag = vnode.type;
  if (tag === "#text") {
    return escapeText(
      String(vnode.props.nodeValue ?? "")
    );
  }
  const props = vnode.props;
  const structural = hasStructuralDirective(props);
  if (hasDirective(props, "vElse")) {
    if (ifContext && !getVElseShow(ifContext.lastVIf)) return "";
    if (ifContext) ifContext.lastVIf = true;
  }
  if (hasDirective(props, "vElseIf")) {
    if (ifContext && ifContext.lastVIf) return "";
    if (!getVElseIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return "";
    }
    if (ifContext) ifContext.lastVIf = true;
  }
  if (structural === "vIf") {
    if (!getVIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return "";
    }
    if (ifContext) ifContext.lastVIf = true;
  }
  if (structural === "vFor") {
    const rawChildren = props.children ?? vnode.children;
    const parsed = getVForListAndFactory(props, rawChildren);
    if (parsed) {
      const { list: list2, factory } = parsed;
      const templateProps = { ...props, vFor: void 0, "v-for": void 0 };
      return list2.map((item, i) => {
        const childResult = factory(item, i);
        const childNodes = Array.isArray(childResult) ? childResult : [childResult];
        const first = childNodes[0];
        const itemVnode = {
          type: tag,
          props: {
            ...templateProps,
            children: childNodes.length === 1 ? childNodes[0] : childNodes
          },
          key: first?.key != null ? first.key : i
        };
        return createElementToString(itemVnode, ifContext, options);
      }).join("");
    }
  }
  let attrs = stringifyAttributes(props);
  if (hasDirective(props, "vShow")) {
    if (!getVShowValue(props)) {
      attrs += ' style="display:none"';
    }
  }
  if (vnode.key != null && vnode.key !== void 0) {
    attrs += ` data-key="${escapeAttr(String(vnode.key))}"`;
  }
  const ctx = ifContext ?? { lastVIf: true };
  let inner;
  if (hasDirective(props, "vText")) {
    inner = escapeText(getVTextValue(props));
  } else if (hasDirective(props, "vHtml")) {
    const html2 = getVHtmlValue(props);
    inner = options?.allowRawHtml === false ? escapeText(html2) : html2;
  } else {
    const children = normalizeChildrenForSSR(props.children ?? vnode.children);
    const hasKeyedChildren = children.some(
      (c) => c.key != null && c.key !== void 0
    );
    inner = hasKeyedChildren ? children.map((c, i) => {
      const v = c;
      const key = v.key != null && v.key !== void 0 ? String(v.key) : `@${i}`;
      return `<span data-view-keyed data-key="${escapeAttr(key)}">${createElementToString(c, ctx, options)}</span>`;
    }).join("") : children.map((c) => createElementToString(c, ctx, options)).join("");
  }
  if (voidElements.has(tag.toLowerCase())) {
    return `<${tag}${attrs}>`;
  }
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

// ../src/runtime.ts
function createRoot(fn, container2) {
  if (!isDOMEnvironment()) {
    return {
      unmount: () => {
      },
      container: null
    };
  }
  let mounted = null;
  let lastExpanded = null;
  let disposed = false;
  const disposers = [];
  const root = {
    container: container2,
    unmount() {
      disposed = true;
      disposers.forEach((d) => d());
      disposers.length = 0;
      if (mounted && container2.contains(mounted)) {
        runDirectiveUnmount(mounted);
        container2.removeChild(mounted);
      }
      mounted = null;
      lastExpanded = null;
    }
  };
  const disposeRoot = createEffect(() => {
    if (disposed) return;
    setCurrentScope({ addDisposer: (d) => disposers.push(d) });
    try {
      const vnode = fn();
      const newExpanded = expandVNode(vnode);
      if (mounted == null || !container2.contains(mounted)) {
        mounted = createNodeFromExpanded(newExpanded);
        container2.appendChild(mounted);
        lastExpanded = newExpanded;
      } else {
        patchRoot(container2, mounted, lastExpanded, newExpanded);
        lastExpanded = newExpanded;
      }
    } finally {
      setCurrentScope(null);
    }
  });
  disposers.push(disposeRoot);
  return root;
}
function renderToString(fn, options) {
  const vnode = fn();
  return createElementToString(vnode, void 0, options);
}
function generateHydrationScript(options = {}) {
  const {
    data,
    dataKey = "__VIEW_DATA__",
    scriptSrc,
    nonce
  } = options;
  const parts = [];
  const nonceAttr = nonce ? ` nonce="${String(nonce).replace(/"/g, "&quot;")}"` : "";
  if (data !== void 0) {
    const payload = JSON.stringify(data);
    const scriptBody = `window.${dataKey}=JSON.parse(${JSON.stringify(payload)})`;
    const safe = scriptBody.replace(/<\/script/gi, "\\u003c/script");
    parts.push(`<script${nonceAttr}>${safe}<\/script>`);
  }
  if (scriptSrc) {
    parts.push(
      `<script type="module" src="${String(scriptSrc).replace(/"/g, "&quot;")}"${nonceAttr}><\/script>`
    );
  }
  return parts.join("");
}

// ../src/router.ts
function hasHistory() {
  try {
    const g = globalThis;
    return typeof g.location !== "undefined" && typeof g.history !== "undefined";
  } catch {
    return false;
  }
}
function pathToRegex(pattern) {
  const paramNames = [];
  const segments = pattern.split("/").filter(Boolean);
  const parts = segments.map((seg) => {
    if (seg.startsWith(":")) {
      paramNames.push(seg.slice(1));
      return "([^/]+)";
    }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  const source = "^/" + (parts.length ? parts.join("/") : "") + "$";
  return { regex: new RegExp(source), paramNames };
}
function parseQuery(search) {
  const out = {};
  if (!search || search === "?") return out;
  const q = search.startsWith("?") ? search.slice(1) : search;
  for (const part of q.split("&")) {
    const [k, v] = part.split("=").map(decodeURIComponent);
    if (k) out[k] = v ?? "";
  }
  return out;
}
function getCurrentPathAndQuery(options) {
  const g = globalThis;
  if (!g.location) return { path: "", search: "" };
  let path = g.location.pathname || "/";
  const search = g.location.search || "";
  const base = options.basePath.replace(/\/$/, "");
  if (base && path.startsWith(base)) {
    path = path.slice(base.length) || "/";
  }
  return { path, search };
}
function createRouter(options) {
  const {
    routes: routes2,
    basePath = "",
    interceptLinks = true,
    notFound: notFoundOption,
    beforeRoute: beforeRouteOption,
    afterRoute: afterRouteOption,
    maxRedirects = 5
  } = options;
  const notFoundConfig = notFoundOption ?? null;
  const beforeGuards = beforeRouteOption == null ? [] : Array.isArray(beforeRouteOption) ? beforeRouteOption : [beforeRouteOption];
  const afterGuards = afterRouteOption == null ? [] : Array.isArray(afterRouteOption) ? afterRouteOption : [afterRouteOption];
  const compiled = routes2.map((r) => ({
    ...r,
    ...pathToRegex(r.path)
  }));
  const subscribers = [];
  let clickHandler = null;
  let popstateHandler = null;
  function getPathAndQuery() {
    return getCurrentPathAndQuery({ basePath });
  }
  function matchPath(pathname, search) {
    const path = pathname.replace(/\?.*$/, "").replace(/#.*$/, "") || "/";
    const query = parseQuery(search);
    for (const r of compiled) {
      const m = path.match(r.regex);
      if (!m) continue;
      const params = {};
      r.paramNames.forEach((name2, i) => {
        params[name2] = m[i + 1] ?? "";
      });
      return {
        path: r.path,
        params,
        query,
        fullPath: path + (search ? search : ""),
        component: r.component,
        meta: r.meta
      };
    }
    if (notFoundConfig) {
      return {
        path: notFoundConfig.path,
        params: {},
        query,
        fullPath: path + (search ? search : ""),
        component: notFoundConfig.component,
        meta: notFoundConfig.meta
      };
    }
    return null;
  }
  function getCurrentRoute() {
    const { path, search } = getPathAndQuery();
    return matchPath(path, search);
  }
  function notify() {
    subscribers.forEach((cb) => cb());
  }
  function resolveMatch(path, search) {
    const p = path.replace(/\?.*$/, "").replace(/#.*$/, "") || "/";
    return matchPath(p, search);
  }
  async function navigate(path, replace2 = false, redirectDepth = 0) {
    if (!hasHistory()) return;
    if (redirectDepth > maxRedirects) return;
    const from = getCurrentRoute();
    const pathNorm = path.startsWith("/") ? path : "/" + path;
    const to = resolveMatch(pathNorm, "");
    for (const guard of beforeGuards) {
      const result = await Promise.resolve(guard(to, from));
      if (result === false) return;
      if (typeof result === "string") {
        await navigate(result, replace2, redirectDepth + 1);
        return;
      }
    }
    const g = globalThis;
    const base = basePath.replace(/\/$/, "") || "";
    const url = `${g.location?.origin ?? ""}${base}${pathNorm}`;
    try {
      if (replace2) {
        g.history?.replaceState(null, "", url);
      } else {
        g.history?.pushState(null, "", url);
      }
      notify();
      const toAfter = getCurrentRoute();
      for (const guard of afterGuards) {
        await Promise.resolve(guard(toAfter, from));
      }
    } catch {
    }
  }
  function href(path) {
    const pathNorm = path.startsWith("/") ? path : "/" + path;
    const base = basePath.replace(/\/$/, "") || "";
    return `${base}${pathNorm}`;
  }
  function replace(path) {
    return navigate(path, true);
  }
  function back() {
    const g = globalThis;
    g.history?.back();
  }
  function forward() {
    const g = globalThis;
    g.history?.forward();
  }
  function go(delta) {
    const g = globalThis;
    g.history?.go(delta);
  }
  function subscribe(callback) {
    subscribers.push(callback);
    return () => {
      const i = subscribers.indexOf(callback);
      if (i !== -1) subscribers.splice(i, 1);
    };
  }
  function start() {
    if (!hasHistory()) return;
    const g = globalThis;
    popstateHandler = () => notify();
    g.addEventListener?.("popstate", popstateHandler);
    if (interceptLinks && g.document) {
      clickHandler = (e) => {
        const target = e.target;
        const a = target?.closest?.("a");
        if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        const href2 = a.getAttribute("href");
        if (!href2 || href2.startsWith("mailto:") || href2.startsWith("tel:")) {
          return;
        }
        if (href2.startsWith("#")) return;
        try {
          const url = new URL(href2, globalThis.location?.href);
          if (url.origin !== globalThis.location?.origin) return;
          e.preventDefault();
          const path = url.pathname + url.search;
          navigate(path.startsWith("/") ? path : "/" + path);
        } catch {
        }
      };
      g.document.addEventListener("click", clickHandler);
    }
  }
  function stop() {
    const g = globalThis;
    if (popstateHandler) {
      g.removeEventListener?.("popstate", popstateHandler);
      popstateHandler = null;
    }
    if (clickHandler && g.document) {
      g.document.removeEventListener("click", clickHandler);
      clickHandler = null;
    }
  }
  return {
    getCurrentRoute,
    href,
    navigate,
    replace,
    back,
    forward,
    go,
    subscribe,
    start,
    stop
  };
}

// ../src/store.ts
var STORE_INTERNAL = /* @__PURE__ */ Symbol.for("view.store.internal");
function createNestedProxy(target, subscribers, proxyCache) {
  const cached = proxyCache.get(target);
  if (cached) return cached;
  const proxy = new Proxy(target, {
    get(t, key) {
      const effect = getCurrentEffect();
      if (effect) subscribers.add(effect);
      const value = Reflect.get(t, key);
      if (value !== null && typeof value === "object") {
        return createNestedProxy(
          value,
          subscribers,
          proxyCache
        );
      }
      return value;
    },
    set(t, key, value) {
      const ok = Reflect.set(t, key, value);
      if (ok) subscribers.forEach((run) => schedule(run));
      return ok;
    }
  });
  proxyCache.set(target, proxy);
  return proxy;
}
function createRootStoreProxy(stateRef, subscribers, proxyCache) {
  return new Proxy(stateRef, {
    get(t, key) {
      if (key === STORE_INTERNAL) {
        return t[STORE_INTERNAL];
      }
      const effect = getCurrentEffect();
      if (effect) subscribers.add(effect);
      const state = t[STORE_INTERNAL];
      const value = state[key];
      if (value !== null && typeof value === "object") {
        return createNestedProxy(
          value,
          subscribers,
          proxyCache
        );
      }
      return value;
    },
    set(t, key, value) {
      const state = t[STORE_INTERNAL];
      if (key === STORE_INTERNAL) {
        t[STORE_INTERNAL] = value;
      } else {
        state[key] = value;
      }
      subscribers.forEach((run) => schedule(run));
      return true;
    }
  });
}
function defaultSerialize(state) {
  return JSON.stringify(state);
}
function defaultDeserialize(raw) {
  return JSON.parse(raw);
}
function getDefaultStorage() {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    return globalThis.localStorage;
  }
  return null;
}
function createStore(config) {
  const {
    state: initial,
    getters: gettersConfig,
    actions: actionsConfig,
    persist
  } = config;
  const subscribers = /* @__PURE__ */ new Set();
  const proxyCache = /* @__PURE__ */ new WeakMap();
  const stateRef = {
    [STORE_INTERNAL]: { ...initial }
  };
  if (persist?.key) {
    const storage = persist.storage ?? getDefaultStorage();
    const deserialize = persist.deserialize ?? defaultDeserialize;
    if (storage) {
      try {
        const raw = storage.getItem(persist.key);
        if (raw != null && raw !== "") {
          const loaded = deserialize(raw);
          if (loaded && typeof loaded === "object") {
            stateRef[STORE_INTERNAL] = { ...initial, ...loaded };
          }
        }
      } catch {
      }
    }
  }
  const getter = () => createRootStoreProxy(stateRef, subscribers, proxyCache);
  const setter = (value) => {
    const prev = stateRef[STORE_INTERNAL];
    const next = typeof value === "function" ? value(prev) : value;
    stateRef[STORE_INTERNAL] = { ...next };
    subscribers.forEach((run) => schedule(run));
    if (persist?.key) {
      const storage = persist.storage ?? getDefaultStorage();
      const serialize = persist.serialize ?? defaultSerialize;
      if (storage) {
        try {
          storage.setItem(persist.key, serialize(stateRef[STORE_INTERNAL]));
        } catch {
        }
      }
    }
  };
  const hasGetters = !!gettersConfig && Object.keys(gettersConfig).length > 0;
  const hasActions = !!actionsConfig && Object.keys(actionsConfig).length > 0;
  if (hasGetters && hasActions) {
    const gettersObj = {};
    for (const [k, fn] of Object.entries(gettersConfig)) {
      if (typeof fn === "function") {
        gettersObj[k] = createMemo(
          () => fn(getter)
        );
      }
    }
    const actionsObj = {};
    for (const [k, fn] of Object.entries(actionsConfig)) {
      if (typeof fn === "function") {
        actionsObj[k] = (...args) => fn(getter, setter, ...args);
      }
    }
    return [
      getter,
      setter,
      gettersObj,
      actionsObj
    ];
  }
  if (hasGetters) {
    const gettersObj = {};
    for (const [k, fn] of Object.entries(gettersConfig)) {
      if (typeof fn === "function") {
        gettersObj[k] = createMemo(
          () => fn(getter)
        );
      }
    }
    return [
      getter,
      setter,
      gettersObj
    ];
  }
  if (hasActions) {
    const actionsObj = {};
    for (const [k, fn] of Object.entries(actionsConfig)) {
      if (typeof fn === "function") {
        actionsObj[k] = (...args) => fn(getter, setter, ...args);
      }
    }
    return [
      getter,
      setter,
      actionsObj
    ];
  }
  return [getter, setter];
}

// src/theme.ts
function applyToDom(theme3) {
  if (typeof globalThis.document === "undefined") return;
  const root = globalThis.document.documentElement;
  if (theme3 === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}
var [get, _set, actions] = createStore({
  state: { theme: "light" },
  actions: {
    setTheme(get3, set, ...args) {
      const next = args[0];
      set({ ...get3(), theme: next });
      applyToDom(next);
    },
    toggleTheme(get3, set) {
      const next = get3().theme === "dark" ? "light" : "dark";
      set({ ...get3(), theme: next });
      applyToDom(next);
    }
  },
  persist: { key: "view-theme" }
});
applyToDom(get().theme);
function theme() {
  return get().theme;
}
var setTheme = actions.setTheme;
var toggleTheme = actions.toggleTheme;

// src/Layout.tsx
var GitHubIcon = () => /* @__PURE__ */ jsx(
  "svg",
  {
    className: "h-6 w-6 text-slate-600 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-slate-200",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsx(
      "path",
      {
        fillRule: "evenodd",
        d: "M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z",
        clipRule: "evenodd"
      }
    )
  }
);
var SunIcon = () => /* @__PURE__ */ jsx(
  "svg",
  {
    className: "h-5 w-5",
    fill: "currentColor",
    viewBox: "0 0 20 20",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsx(
      "path",
      {
        fillRule: "evenodd",
        d: "M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z",
        clipRule: "evenodd"
      }
    )
  }
);
var MoonIcon = () => /* @__PURE__ */ jsx(
  "svg",
  {
    className: "h-5 w-5",
    fill: "currentColor",
    viewBox: "0 0 20 20",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsx("path", { d: "M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" })
  }
);
function Layout(props) {
  const { navItems: navItems2, currentPath = "", children } = props;
  const isDark = theme() === "dark";
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/80 dark:from-slate-900 dark:to-slate-800/80", children: [
    /* @__PURE__ */ jsx("header", { className: "sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-800/80", children: /* @__PURE__ */ jsxs("nav", { className: "mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6", children: [
      /* @__PURE__ */ jsxs(
        "a",
        {
          href: "/",
          className: "flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-800 hover:text-indigo-600 transition-colors dark:text-slate-200 dark:hover:text-indigo-400",
          children: [
            "@dreamer/view",
            /* @__PURE__ */ jsx("span", { className: "rounded-md border border-slate-200 bg-slate-100/80 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-700/80 dark:text-slate-300", children: "\u793A\u4F8B" })
          ]
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1 sm:gap-2", children: [
        /* @__PURE__ */ jsx("ul", { className: "flex flex-wrap items-center gap-1 sm:gap-2", children: navItems2.map((item) => {
          const isActive = currentPath === item.path;
          return /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(
            "a",
            {
              href: item.path,
              className: isActive ? "rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 shadow-sm dark:text-indigo-300 dark:bg-indigo-900/50" : "rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100",
              children: item.label
            }
          ) }, item.path);
        }) }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => toggleTheme(),
            className: "rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200",
            title: isDark ? "\u5207\u6362\u5230\u6D45\u8272" : "\u5207\u6362\u5230\u6DF1\u8272",
            "aria-label": isDark ? "\u5207\u6362\u5230\u6D45\u8272" : "\u5207\u6362\u5230\u6DF1\u8272",
            children: isDark ? /* @__PURE__ */ jsx(SunIcon, {}) : /* @__PURE__ */ jsx(MoonIcon, {})
          }
        ),
        /* @__PURE__ */ jsx(
          "a",
          {
            href: "https://github.com/shuliangfu/view",
            target: "_blank",
            rel: "noopener noreferrer",
            className: "rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200",
            title: "view \u6A21\u677F\u5F15\u64CE \u2014 GitHub",
            children: /* @__PURE__ */ jsx(GitHubIcon, {})
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("main", { className: "mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10", children })
  ] });
}

// src/router-context.tsx
var RouterContext = createContext(null);
function RouterProvider(props) {
  return RouterContext.Provider({
    value: props.router,
    children: props.children
  });
}
RouterContext.registerProviderAlias(
  RouterProvider,
  (p) => p.router
);
function useRouter() {
  return RouterContext.useContext();
}

// src/SignalDemo.tsx
var [count, setCount] = createSignal(0);
var [name, setName] = createSignal("");
var double = createMemo(() => count() * 2);
createEffect(() => {
  const n = name();
  if (n) {
    const t = setTimeout(() => {
    }, 0);
    onCleanup(() => clearTimeout(t));
  }
});
var btn = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
var inputCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";
function SignalDemo() {
  return /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10", children: [
    /* @__PURE__ */ jsx("p", { className: "mb-2 text-sm font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-400", children: "\u6838\u5FC3 API" }),
    /* @__PURE__ */ jsx("h2", { className: "mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl", children: "createSignal / createEffect / createMemo / onCleanup" }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30", children: [
        /* @__PURE__ */ jsxs("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: [
          "count\uFF1A",
          /* @__PURE__ */ jsx("span", { className: "font-mono font-semibold text-indigo-600 dark:text-indigo-400", children: count }),
          " \xB7 ",
          "double\uFF08createMemo\uFF09\uFF1A",
          /* @__PURE__ */ jsx("span", { className: "font-mono font-semibold text-indigo-600 dark:text-indigo-400", children: double })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn,
              onClick: () => setCount((c) => c + 1),
              children: "+1"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn,
              onClick: () => setCount((c) => c - 1),
              children: "-1"
            }
          ),
          /* @__PURE__ */ jsx("button", { type: "button", className: btn, onClick: () => setCount(0), children: "\u5F52\u96F6" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30", children: [
        /* @__PURE__ */ jsxs("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: [
          "name\uFF1A",
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              className: `ml-2 ${inputCls}`,
              value: () => name(),
              onInput: (e) => setName(e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: () => name() ? `\u4F60\u597D\uFF0C${name()}\uFF01` : "\u8BF7\u8F93\u5165\u540D\u5B57" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 dark:text-slate-400", children: "createEffect \u4E0E onCleanup \u5DF2\u5728\u6A21\u5757\u5185\u4F7F\u7528\uFF1BcreateMemo \u7528\u4E8E double\u3002" })
      ] })
    ] })
  ] });
}

// src/StoreDemo.tsx
var [get2, _set2, getters, actions2] = createStore({
  state: { count: 0, name: "" },
  getters: {
    double(get3) {
      return get3().count * 2;
    },
    greeting(get3) {
      return get3().name ? `\u4F60\u597D\uFF0C${get3().name}\uFF01` : "\u8BF7\u8F93\u5165\u540D\u5B57";
    }
  },
  actions: {
    increment(get3, set) {
      set({ ...get3(), count: get3().count + 1 });
    },
    reset(get3, set) {
      set({ ...get3(), count: 0 });
    },
    setName(get3, set, ...args) {
      set({ ...get3(), name: args[0] });
    }
  },
  persist: { key: "view-demo-store" }
});
var btn2 = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
var inputCls2 = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";
function StoreDemo() {
  return /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10", children: [
    /* @__PURE__ */ jsx("p", { className: "mb-2 text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400", children: "Store" }),
    /* @__PURE__ */ jsx("h2", { className: "mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl", children: "createStore\uFF08getters / actions / persist\uFF09" }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30", children: [
        /* @__PURE__ */ jsxs("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: [
          "count\uFF1A",
          /* @__PURE__ */ jsx("span", { className: "font-mono font-semibold text-indigo-600 dark:text-indigo-400", children: () => get2().count }),
          " \xB7 ",
          "double\uFF1A",
          /* @__PURE__ */ jsx("span", { className: "font-mono font-semibold text-indigo-600 dark:text-indigo-400", children: getters.double })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: /* @__PURE__ */ jsx("span", { className: "font-medium text-indigo-600 dark:text-indigo-400", children: getters.greeting }) }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            className: `mb-3 ${inputCls2}`,
            placeholder: "\u8F93\u5165\u540D\u5B57",
            value: () => get2().name,
            onInput: (e) => actions2.setName(e.target.value)
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn2,
              onClick: () => actions2.increment(),
              children: "count +1"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn2,
              onClick: () => actions2.reset(),
              children: "count \u5F52\u96F6"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "rounded-lg border-l-4 border-emerald-500/50 bg-emerald-500/5 px-4 py-3 text-sm text-slate-600 dark:bg-emerald-500/10 dark:text-slate-300", children: "\u72B6\u6001\u5DF2\u6301\u4E45\u5316\u5230 localStorage\uFF08key: view-demo-store\uFF09\uFF0C\u5237\u65B0\u9875\u9762\u4F1A\u6062\u590D\u3002" })
    ] })
  ] });
}

// src/BoundaryDemo.tsx
var btn3 = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
function Thrower(props) {
  if (props.shouldThrow) throw new Error("\u5B50\u7EC4\u4EF6\u6545\u610F\u629B\u9519");
  return /* @__PURE__ */ jsx("span", { className: "text-slate-600 dark:text-slate-300", children: "\u672A\u629B\u9519" });
}
function AsyncContent() {
  return new Promise((resolve) => {
    setTimeout(
      () => resolve(
        /* @__PURE__ */ jsx("span", { className: "text-slate-600 dark:text-slate-300", children: "\u5F02\u6B65\u5185\u5BB9\u5DF2\u52A0\u8F7D" })
      ),
      1e3
    );
  });
}
var [shouldThrow, setShouldThrow] = createSignal(false);
function BoundaryDemo() {
  return /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10", children: [
    /* @__PURE__ */ jsx("p", { className: "mb-2 text-sm font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400", children: "Boundary" }),
    /* @__PURE__ */ jsx("h2", { className: "mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl", children: "ErrorBoundary / Suspense" }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30", children: [
        /* @__PURE__ */ jsx("h3", { className: "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400", children: "ErrorBoundary" }),
        /* @__PURE__ */ jsx("p", { className: "mb-3", children: /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: btn3,
            onClick: () => setShouldThrow((x) => !x),
            children: "\u5207\u6362\u300C\u629B\u9519\u300D\u72B6\u6001"
          }
        ) }),
        /* @__PURE__ */ jsx(
          ErrorBoundary,
          {
            fallback: (err) => /* @__PURE__ */ jsxs("p", { className: "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200", children: [
              "\u6355\u83B7\u5230\u9519\u8BEF\uFF1A",
              String(err)
            ] }),
            children: /* @__PURE__ */ jsx(Thrower, { shouldThrow: shouldThrow() })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30", children: [
        /* @__PURE__ */ jsx("h3", { className: "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400", children: "Suspense" }),
        /* @__PURE__ */ jsx(
          Suspense,
          {
            fallback: /* @__PURE__ */ jsx("p", { className: "text-slate-500 dark:text-slate-400", children: "\u52A0\u8F7D\u4E2D\u2026" }),
            children: AsyncContent()
          }
        )
      ] })
    ] })
  ] });
}

// src/DirectiveDemo.tsx
registerDirective("v-focus", {
  mounted(el) {
    el.focus();
  }
});
var btn4 = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
var inputCls3 = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";
var [tab, setTab] = createSignal("a");
var [show, setShow] = createSignal(true);
var [list, setList] = createSignal(["\u82F9\u679C", "\u9999\u8549", "\u6A59\u5B50"]);
var [rawHtml, setRawHtml] = createSignal("<em>\u4FE1\u4EFB\u7684 HTML</em>");
var [vModelText, setVModelText] = createSignal("");
var [vModelChecked, setVModelChecked] = createSignal(false);
var htmlInputEl = null;
var focusInputEl = null;
var subTitle = "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
var block = "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
function DirectiveDemo() {
  return /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10", children: [
    /* @__PURE__ */ jsx("p", { className: "mb-2 text-sm font-medium uppercase tracking-wider text-violet-600 dark:text-violet-400", children: "\u6307\u4EE4" }),
    /* @__PURE__ */ jsx("h2", { className: "mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl", children: "vIf / vElse / vFor / vShow / vText / vHtml / vModel / \u81EA\u5B9A\u4E49" }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
      /* @__PURE__ */ jsxs("div", { className: block, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle, children: "v-if / v-else / v-else-if" }),
        /* @__PURE__ */ jsxs("p", { className: "mb-3 flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: btn4, onClick: () => setTab("a"), children: "A" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: btn4, onClick: () => setTab("b"), children: "B" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: btn4, onClick: () => setTab("c"), children: "C" })
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "text-slate-600 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              vIf: () => tab() === "a",
              className: "font-medium text-indigo-600 dark:text-indigo-400",
              children: "\u5F53\u524D\u662F A"
            }
          ),
          /* @__PURE__ */ jsx(
            "span",
            {
              vElseIf: () => tab() === "b",
              className: "font-medium text-indigo-600 dark:text-indigo-400",
              children: "\u5F53\u524D\u662F B"
            }
          ),
          /* @__PURE__ */ jsx(
            "span",
            {
              vElse: true,
              className: "font-medium text-indigo-600 dark:text-indigo-400",
              children: "\u5F53\u524D\u662F C"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle, children: "v-show" }),
        /* @__PURE__ */ jsxs("p", { className: "text-slate-600 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn4,
              onClick: () => setShow((x) => !x),
              children: "\u5207\u6362\u663E\u793A"
            }
          ),
          /* @__PURE__ */ jsx("span", { vShow: show, className: "ml-2", children: "\u8FD9\u6BB5\u7531 vShow \u63A7\u5236\u663E\u9690\uFF08\u4E0D\u9500\u6BC1\u8282\u70B9\uFF09" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle, children: "v-for" }),
        /* @__PURE__ */ jsx(
          "ul",
          {
            vFor: () => list(),
            className: "mb-3 list-inside list-disc space-y-1 text-slate-600 dark:text-slate-300",
            children: (item, i) => /* @__PURE__ */ jsxs("li", { children: [
              i + 1,
              ". ",
              String(item)
            ] }, i)
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: btn4,
            onClick: () => setList((prev) => [...prev, "\u65B0\u9879"]),
            children: "\u8FFD\u52A0\u4E00\u9879"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle, children: "v-text / v-html" }),
        /* @__PURE__ */ jsx(
          "p",
          {
            className: "mb-3 text-slate-600 dark:text-slate-300",
            vText: () => `v-text\uFF1A${tab()}`
          }
        ),
        /* @__PURE__ */ jsxs("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: [
          "v-html\uFF08\u4EC5\u4FE1\u4EFB\u5185\u5BB9\uFF09\uFF1A",
          /* @__PURE__ */ jsx("span", { vHtml: () => rawHtml(), className: "italic" })
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              className: inputCls3,
              placeholder: "\u8F93\u5165 HTML \u7247\u6BB5",
              "data-testid": "v-html-input",
              ref: (el) => {
                htmlInputEl = el;
              }
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn4,
              onClick: () => {
                const v = htmlInputEl?.value?.trim() || "<em>\u4FE1\u4EFB\u7684 HTML</em>";
                setRawHtml(v);
              },
              children: "\u751F\u6210 HTML"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle, children: "v-model \u53CC\u5411\u7ED1\u5B9A" }),
        /* @__PURE__ */ jsxs("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: [
          "vModel=",
          "{[getter, setter]}",
          "\uFF0C\u540C createSignal \u8FD4\u56DE\u503C\uFF1B\u652F\u6301 input / textarea / select\u3002"
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "mb-2 flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              className: inputCls3,
              placeholder: "\u8F93\u5165\u5373\u540C\u6B65",
              vModel: [vModelText, setVModelText]
            }
          ),
          /* @__PURE__ */ jsxs("span", { children: [
            "\u2192 \u5F53\u524D\u503C\uFF1A",
            () => vModelText() || "(\u7A7A)"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300", children: [
          /* @__PURE__ */ jsxs("label", { className: "flex cursor-pointer items-center gap-2", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                vModel: [vModelChecked, setVModelChecked]
              }
            ),
            /* @__PURE__ */ jsx("span", { children: "\u52FE\u9009\u5373\u540C\u6B65" })
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            "\u2192 checked\uFF1A",
            () => String(vModelChecked())
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle, children: "\u81EA\u5B9A\u4E49\u6307\u4EE4 v-focus" }),
        /* @__PURE__ */ jsx("p", { className: "mb-2 text-slate-600 dark:text-slate-300", children: "\u6302\u8F7D\u65F6\u81EA\u52A8\u8BA9\u8BE5\u8F93\u5165\u6846\u83B7\u5F97\u7126\u70B9\uFF08\u51FA\u73B0\u5149\u6807/\u9AD8\u4EAE\u8FB9\u6846\uFF09\uFF0C\u65E0\u9700\u518D\u70B9\u4E00\u4E0B\u5373\u53EF\u76F4\u63A5\u8F93\u5165\u3002\u82E5\u672A\u770B\u5230\u6548\u679C\uFF0C\u53EF\u5148\u70B9\u51FB\u5176\u5B83\u533A\u57DF\u518D\u70B9\u300C\u518D\u6B21\u805A\u7126\u300D\u89C2\u5BDF\u3002" }),
        /* @__PURE__ */ jsxs("p", { className: "flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              className: inputCls3,
              placeholder: "\u83B7\u5F97\u7126\u70B9",
              vFocus: true,
              ref: (el) => {
                focusInputEl = el;
              }
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn4,
              onClick: () => focusInputEl?.focus(),
              children: "\u518D\u6B21\u805A\u7126"
            }
          )
        ] })
      ] })
    ] })
  ] });
}

// ../src/reactive.ts
function createNestedProxy2(target, subscribers, proxyCache) {
  const cached = proxyCache.get(target);
  if (cached) return cached;
  const proxy = new Proxy(target, {
    get(t, key) {
      const effect = getCurrentEffect();
      if (effect) subscribers.add(effect);
      const value = Reflect.get(t, key);
      if (value !== null && typeof value === "object") {
        return createNestedProxy2(
          value,
          subscribers,
          proxyCache
        );
      }
      return value;
    },
    set(t, key, value) {
      const ok = Reflect.set(t, key, value);
      if (ok) subscribers.forEach((run) => schedule(run));
      return ok;
    }
  });
  proxyCache.set(target, proxy);
  return proxy;
}
function createReactive(initial) {
  const state = { ...initial };
  const subscribers = /* @__PURE__ */ new Set();
  const proxyCache = /* @__PURE__ */ new WeakMap();
  return createNestedProxy2(state, subscribers, proxyCache);
}

// src/ReactiveDemo.tsx
var btn5 = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
var inputCls4 = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";
var subTitle2 = "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
var block2 = "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
var formModel = createReactive({
  name: "",
  age: "",
  sex: "",
  fruit: "",
  choice: "a"
});
function DropdownList(props) {
  const { model, field } = props;
  if (!model || field == null) {
    return /* @__PURE__ */ jsx("select", { className: props.className ?? inputCls4, disabled: true });
  }
  return /* @__PURE__ */ jsxs(
    "select",
    {
      className: props.className ?? inputCls4,
      value: () => model[field] ?? "",
      onChange: (e) => {
        model[field] = e.target.value;
      },
      children: [
        props.placeholder ? /* @__PURE__ */ jsx("option", { value: "", children: props.placeholder }) : null,
        (props.options ?? []).map((opt) => /* @__PURE__ */ jsx("option", { value: opt, children: opt }, opt))
      ]
    }
  );
}
function RadioGroup(props) {
  const { model, field } = props;
  if (!model || field == null) return /* @__PURE__ */ jsx("div", { role: "radiogroup" });
  const name2 = props.name ?? "radio-group";
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: `flex flex-wrap gap-3 ${props.className ?? ""}`,
      role: "radiogroup",
      children: (props.options ?? []).map((opt) => /* @__PURE__ */ jsxs(
        "label",
        {
          className: "flex cursor-pointer items-center gap-2 text-slate-600 dark:text-slate-300",
          children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "radio",
                name: name2,
                value: opt.value,
                checked: () => (model[field] ?? "") === opt.value,
                onChange: () => {
                  model[field] = opt.value;
                }
              }
            ),
            /* @__PURE__ */ jsx("span", { children: opt.label })
          ]
        },
        opt.value
      ))
    }
  );
}
function ReactiveDemo() {
  const [logCount, setLogCount] = createSignal(0);
  const reactiveState = createReactive({ count: 0 });
  createEffect(() => {
    void reactiveState.count;
    setLogCount((c) => c + 1);
  });
  return /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10", children: [
    /* @__PURE__ */ jsx("p", { className: "mb-2 text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400", children: "\u54CD\u5E94\u5F0F\u6570\u636E" }),
    /* @__PURE__ */ jsx("h2", { className: "mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl", children: "createReactive" }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
      /* @__PURE__ */ jsxs("div", { className: block2, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle2, children: "\u7B80\u4ECB" }),
        /* @__PURE__ */ jsx("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: "createReactive(initial) \u8FD4\u56DE\u4E0E createEffect \u8054\u52A8\u7684\u4EE3\u7406\u5BF9\u8C61\uFF0C\u9002\u5408\u4F5C\u4E3A\u8868\u5355 model \u7B49\u300C\u4F20\u4E00\u4E2A\u53D8\u91CF\u3001\u53CC\u5411\u66F4\u65B0\u300D\u7684\u573A\u666F\u3002\u4E0E store \u804C\u8D23\u5206\u79BB\uFF1Astore \u8D1F\u8D23\u5B8C\u6574\u72B6\u6001\uFF08getters/actions\uFF09\uFF1Breactive \u4EC5\u505A\u54CD\u5E94\u5F0F\u5BF9\u8C61\u3002" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block2, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle2, children: "reactive + createEffect" }),
        /* @__PURE__ */ jsx("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: "\u5728 effect \u5185\u8BFB\u53D6 reactive \u5C5E\u6027\u4F1A\u767B\u8BB0\u4F9D\u8D56\uFF0C\u4FEE\u6539\u5C5E\u6027\u4F1A\u89E6\u53D1 effect \u91CD\u65B0\u6267\u884C\u3002" }),
        /* @__PURE__ */ jsxs("p", { className: "mb-3 flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn5,
              onClick: () => {
                reactiveState.count++;
              },
              children: "reactiveState.count++"
            }
          ),
          /* @__PURE__ */ jsxs("span", { children: [
            "\u2192 effect \u5DF2\u6267\u884C\u6B21\u6570\uFF1A",
            () => logCount()
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block2, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle2, children: "\u8868\u5355\uFF08\u7EDF\u4E00\u4F20 createReactive model\uFF09" }),
        /* @__PURE__ */ jsx("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: "\u4E00\u4E2A createReactive \u5BF9\u8C61\u8D2F\u7A7F\u6574\u8868\uFF1Avalue \u652F\u6301\u76F4\u63A5\u503C\u6216 getter\uFF1BonInput \u5199\u56DE model\uFF0C\u81EA\u5B9A\u4E49\u7EC4\u4EF6\u4F20 model + field\u3002 \u6839\u66F4\u65B0\u4E3A patch \u539F\u5730\u534F\u8C03\uFF0C\u4E0D\u6574\u6811\u66FF\u6362\uFF0C\u8868\u5355\u4E0D\u91CD\u6302\u3001\u4E0D\u4E22\u7126\u70B9\u3002" }),
        /* @__PURE__ */ jsxs("div", { className: "mb-3 flex flex-wrap gap-4 text-slate-600 dark:text-slate-300", children: [
          /* @__PURE__ */ jsxs("label", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs", children: "\u59D3\u540D" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                className: inputCls4,
                placeholder: "\u59D3\u540D",
                value: () => formModel.name,
                onInput: (e) => {
                  formModel.name = e.target.value;
                }
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs", children: "\u5E74\u9F84" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                className: inputCls4,
                placeholder: "\u5E74\u9F84",
                value: () => formModel.age,
                onInput: (e) => {
                  formModel.age = e.target.value;
                }
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs", children: "\u6027\u522B" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                className: inputCls4,
                placeholder: "\u6027\u522B",
                value: () => formModel.sex,
                onInput: (e) => {
                  formModel.sex = e.target.value;
                }
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs", children: "\u6C34\u679C" }),
            /* @__PURE__ */ jsx(
              DropdownList,
              {
                options: ["\u82F9\u679C", "\u9999\u8549", "\u6A59\u5B50", "\u8461\u8404"],
                placeholder: "\u8BF7\u9009\u62E9",
                model: formModel,
                field: "fruit",
                className: inputCls4
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex flex-col gap-1", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs", children: "\u9009\u9879" }),
            /* @__PURE__ */ jsx(
              RadioGroup,
              {
                name: "choice",
                options: [{ value: "a", label: "A" }, {
                  value: "b",
                  label: "B"
                }, { value: "c", label: "C" }],
                model: formModel,
                field: "choice"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          "p",
          {
            className: "text-slate-600 dark:text-slate-300",
            vText: () => `\u2192 name=${formModel.name || "(\u7A7A)"}\uFF0Cage=${formModel.age || "(\u7A7A)"}\uFF0Csex=${formModel.sex || "(\u7A7A)"}\uFF0Cfruit=${formModel.fruit || "(\u672A\u9009)"}\uFF0Cchoice=${formModel.choice}`
          }
        )
      ] })
    ] })
  ] });
}

// ../src/resource.ts
function createResource(sourceOrFetcher, maybeFetcher) {
  const hasSource = typeof maybeFetcher === "function";
  const source = hasSource ? sourceOrFetcher : (() => void 0);
  const fetcher = hasSource ? maybeFetcher : sourceOrFetcher;
  const [getState, setState] = createSignal({
    data: void 0,
    loading: false,
    error: void 0
  });
  const runRef = { current: () => {
  } };
  let generation = 0;
  createEffect(() => {
    const gen = ++generation;
    const s = source();
    runRef.current = () => {
      setState((prev) => ({ ...prev, loading: true, error: void 0 }));
      Promise.resolve(fetcher(s)).then((value) => {
        if (gen !== generation) return;
        setState({ data: value, loading: false, error: void 0 });
      }).catch((e) => {
        if (gen !== generation) return;
        setState((prev) => ({ ...prev, loading: false, error: e }));
      });
    };
    runRef.current();
    return () => {
      generation = -1;
    };
  });
  const getter = () => {
    const s = getState();
    return { ...s, refetch: () => runRef.current() };
  };
  return markSignalGetter(getter);
}

// src/ResourceDemo.tsx
function fakeApi(id) {
  return new Promise((resolve) => {
    setTimeout(
      () => resolve({ id, name: `\u7528\u6237ID\uFF1A${id}` }),
      800
    );
  });
}
var user = createResource(() => fakeApi(1));
var [userId, setUserId] = createSignal(1);
var userById = createResource(userId, (id) => fakeApi(id));
var btn6 = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
var block3 = "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
var subTitle3 = "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
function ResourceDemo() {
  return /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10", children: [
    /* @__PURE__ */ jsx("p", { className: "mb-2 text-sm font-medium uppercase tracking-wider text-cyan-600 dark:text-cyan-400", children: "Resource" }),
    /* @__PURE__ */ jsx("h2", { className: "mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl", children: "createResource" }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
      /* @__PURE__ */ jsxs("div", { className: block3, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle3, children: "\u65E0 source\uFF08refetch\uFF09" }),
        /* @__PURE__ */ jsx("p", { className: "mb-3", children: /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: btn6,
            onClick: () => user().refetch(),
            children: "\u91CD\u65B0\u8BF7\u6C42"
          }
        ) }),
        /* @__PURE__ */ jsx("p", { className: "font-mono text-sm text-slate-600 dark:text-slate-300", children: () => {
          const r = user();
          if (r.loading) {
            return /* @__PURE__ */ jsx("span", { className: "text-amber-600 dark:text-amber-400", children: "\u52A0\u8F7D\u4E2D\u2026" });
          }
          if (r.error) {
            return /* @__PURE__ */ jsxs("span", { className: "text-red-600 dark:text-red-400", children: [
              "\u9519\u8BEF\uFF1A",
              String(r.error)
            ] });
          }
          return r.data ? `data: ${r.data.name}` : "\u65E0\u6570\u636E";
        } })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block3, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle3, children: "\u6709 source\uFF08id \u53D8\u5316\u81EA\u52A8\u8BF7\u6C42\uFF09" }),
        /* @__PURE__ */ jsxs("p", { className: "mb-3 flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: btn6, onClick: () => setUserId(1), children: "id=1" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: btn6, onClick: () => setUserId(2), children: "id=2" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: btn6, onClick: () => setUserId(3), children: "id=3" })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "font-mono text-sm text-slate-600 dark:text-slate-300", children: () => {
          const r = userById();
          if (r.loading) {
            return /* @__PURE__ */ jsx("span", { className: "text-amber-600 dark:text-amber-400", children: "\u52A0\u8F7D\u4E2D\u2026" });
          }
          if (r.error) {
            return /* @__PURE__ */ jsxs("span", { className: "text-red-600 dark:text-red-400", children: [
              "\u9519\u8BEF\uFF1A",
              String(r.error)
            ] });
          }
          return r.data ? `data: ${r.data.name}` : "\u65E0\u6570\u636E";
        } })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block3, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle3, children: "Suspense + Promise" }),
        /* @__PURE__ */ jsx(
          Suspense,
          {
            fallback: /* @__PURE__ */ jsx("p", { className: "text-slate-500 dark:text-slate-400", children: "Suspense \u52A0\u8F7D\u4E2D\u2026" }),
            children: fakeApi(99).then((d) => /* @__PURE__ */ jsxs("span", { className: "text-slate-600 dark:text-slate-300", children: [
              "\u52A0\u8F7D\u5230\uFF1A",
              d.name
            ] }))
          }
        )
      ] })
    ] })
  ] });
}

// src/ContextDemo.tsx
var ThemeContext = createContext("light");
var btn7 = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
function ThemedBox() {
  const theme3 = ThemeContext.useContext();
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: theme3 === "dark" ? "rounded-xl border border-slate-600 bg-slate-800 px-5 py-4 text-slate-200 shadow-inner" : "rounded-xl border border-slate-200 bg-slate-100 px-5 py-4 text-slate-800 shadow-inner dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200",
      children: [
        "\u5F53\u524D\u4E3B\u9898\uFF1A",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-indigo-600 dark:text-indigo-400", children: theme3 })
      ]
    }
  );
}
var [theme2, setTheme2] = createSignal("light");
function ContextDemo() {
  return /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10", children: [
    /* @__PURE__ */ jsx("p", { className: "mb-2 text-sm font-medium uppercase tracking-wider text-rose-600 dark:text-rose-400", children: "Context" }),
    /* @__PURE__ */ jsx("h2", { className: "mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl", children: "createContext / Provider / useContext" }),
    /* @__PURE__ */ jsx("div", { className: "space-y-6", children: /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30", children: [
      /* @__PURE__ */ jsx("p", { className: "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400", children: "\u5207\u6362 Provider \u503C" }),
      /* @__PURE__ */ jsxs("p", { className: "mb-4 flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: btn7,
            onClick: () => setTheme2("light"),
            children: "light"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: btn7,
            onClick: () => setTheme2("dark"),
            children: "dark"
          }
        )
      ] }),
      /* @__PURE__ */ jsx(ThemeContext.Provider, { value: theme2(), children: /* @__PURE__ */ jsx(ThemedBox, {}) })
    ] }) })
  ] });
}

// src/RuntimeDemo.tsx
var [ssrSample, setSsrSample] = createSignal("Hello SSR");
function SsrSample() {
  return /* @__PURE__ */ jsxs("div", { children: [
    "renderToString \u8F93\u51FA\uFF1A",
    ssrSample()
  ] });
}
var [html, setHtml] = createSignal("");
var btn8 = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
var inputCls5 = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";
var codeRootStr = "createRoot(() => <App />, container)";
var codeRenderStr = "render(fn, container)";
var block4 = "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
var subTitle4 = "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
function RuntimeDemo() {
  return /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10", children: [
    /* @__PURE__ */ jsx("p", { className: "mb-2 text-sm font-medium uppercase tracking-wider text-sky-600 dark:text-sky-400", children: "Runtime" }),
    /* @__PURE__ */ jsx("h2", { className: "mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl", children: "createRoot / render / renderToString / generateHydrationScript" }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
      /* @__PURE__ */ jsxs("p", { className: "text-slate-600 dark:text-slate-300", children: [
        "\u672C\u793A\u4F8B\u5165\u53E3\u4F7F\u7528",
        " ",
        /* @__PURE__ */ jsx("code", { className: "rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-800 dark:bg-slate-700 dark:text-slate-200", children: codeRootStr }),
        " ",
        "\u6302\u8F7D\u3002",
        " ",
        /* @__PURE__ */ jsx("code", { className: "rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-800 dark:bg-slate-700 dark:text-slate-200", children: codeRenderStr }),
        " ",
        "\u4E0E createRoot \u7B49\u4EF7\u3002"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block4, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle4, children: "renderToString\uFF08SSR \u8F93\u51FA\uFF09" }),
        /* @__PURE__ */ jsxs("p", { className: "mb-3 flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              className: inputCls5,
              value: () => ssrSample(),
              onInput: (e) => setSsrSample(e.target.value)
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn8,
              onClick: () => setHtml(renderToString(() => /* @__PURE__ */ jsx(SsrSample, {}))),
              children: "\u751F\u6210 HTML"
            }
          )
        ] }),
        /* @__PURE__ */ jsx("pre", { className: "rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-800 overflow-auto dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200", children: () => html() || "\u70B9\u51FB\u300C\u751F\u6210 HTML\u300D\u67E5\u770B renderToString \u7ED3\u679C" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block4, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle4, children: "generateHydrationScript\uFF08\u53EF\u6CE8\u5165\u7684\u811A\u672C HTML\uFF09" }),
        /* @__PURE__ */ jsxs("p", { className: "mb-3 text-sm text-slate-600 dark:text-slate-300", children: [
          "\u7528\u4E8E Hybrid\uFF1A\u670D\u52A1\u7AEF\u5C06 data \u4E0E\u5BA2\u6237\u7AEF\u811A\u672C\u6CE8\u5165 HTML\uFF0C\u5BA2\u6237\u7AEF\u901A\u8FC7",
          /* @__PURE__ */ jsx("code", { className: "mx-1 rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80", children: "window.__VIEW_DATA__" }),
          "\u8BFB\u53D6\u5E76\u6267\u884C hydrate(fn, container)\u3002"
        ] }),
        /* @__PURE__ */ jsx("pre", { className: "rounded-xl border border-slate-200 bg-slate-100 p-4 text-xs text-slate-800 overflow-auto dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 whitespace-pre-wrap break-all", children: generateHydrationScript({
          data: { userId: 1, preload: true },
          dataKey: "__VIEW_DATA__",
          scriptSrc: "/client.js"
        }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border-l-4 border-sky-500/50 bg-sky-500/5 px-4 py-3 dark:bg-sky-500/10", children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle4, children: "renderToStream\uFF08view/stream\uFF09" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600 dark:text-slate-300 mb-2", children: "\u6D41\u5F0F SSR\uFF1A\u5728 Node/Deno \u670D\u52A1\u7AEF\u4F7F\u7528\uFF0C\u8FB9\u6E32\u67D3\u8FB9\u8F93\u51FA\uFF0C\u9002\u5408\u9996\u5C4F\u6D41\u5F0F\u54CD\u5E94\u3002" }),
        /* @__PURE__ */ jsx("pre", { className: "rounded-lg bg-slate-100 dark:bg-slate-700 p-3 text-xs text-slate-700 dark:text-slate-300 overflow-x-auto", children: `import { renderToStream } from "@dreamer/view/stream";
// for (const chunk of renderToStream(() => <App />)) {
//   res.write(chunk);
// }` })
      ] })
    ] })
  ] });
}

// src/RouterDemo.tsx
var pathInputEl = null;
var btn9 = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
var block5 = "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
var subTitle5 = "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
function RouterDemo() {
  const router = useRouter();
  if (!router) {
    return /* @__PURE__ */ jsx("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10", children: /* @__PURE__ */ jsx("p", { className: "text-slate-600 dark:text-slate-300", children: "Router \u672A\u6CE8\u5165" }) });
  }
  const current = router.getCurrentRoute();
  const currentPath = current?.fullPath ?? "";
  const currentHref = router.href("/signal");
  return /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10", children: [
    /* @__PURE__ */ jsx("p", { className: "mb-2 text-sm font-medium uppercase tracking-wider text-teal-600 dark:text-teal-400", children: "Router" }),
    /* @__PURE__ */ jsx("h2", { className: "mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl", children: "navigate / replace / back / forward / href / \u5B88\u536B" }),
    /* @__PURE__ */ jsxs("p", { className: "mb-6 text-slate-600 dark:text-slate-300 leading-relaxed", children: [
      "\u672C\u793A\u4F8B\u4F7F\u7528",
      " ",
      /* @__PURE__ */ jsx("code", { className: "rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80", children: "@dreamer/view/router" }),
      "\uFF0C\u652F\u6301 history \u6A21\u5F0F\u3001path \u5339\u914D\u3001\u52A8\u6001\u53C2\u6570\uFF08\u5982",
      " ",
      /* @__PURE__ */ jsx("code", { className: "rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80", children: "/user/:id" }),
      "\uFF09\u3001\u7F16\u7A0B\u5F0F\u5BFC\u822A\u4E0E\u5B88\u536B\u3002\u94FE\u63A5\u76F4\u63A5\u5199",
      " ",
      /* @__PURE__ */ jsx("code", { className: "rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80", children: 'href="/path"' }),
      " ",
      "\u5373\u53EF\u65E0\u5237\u65B0\u8DF3\u8F6C\u3002"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
      /* @__PURE__ */ jsxs("div", { className: block5, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle5, children: "\u5F53\u524D\u8DEF\u7531" }),
        /* @__PURE__ */ jsxs("p", { className: "font-mono text-sm text-slate-600 dark:text-slate-300", children: [
          "\u5F53\u524D\u8DEF\u5F84\uFF1A",
          /* @__PURE__ */ jsx("span", { className: "font-semibold text-indigo-600 dark:text-indigo-400", children: currentPath || "(\u7A7A)" })
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "mt-1 font-mono text-sm text-slate-600 dark:text-slate-300", children: [
          'router.href("/signal") \u2192',
          " ",
          /* @__PURE__ */ jsx("span", { className: "font-semibold text-indigo-600 dark:text-indigo-400", children: currentHref })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block5, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle5, children: "\u7F16\u7A0B\u5F0F\u5BFC\u822A" }),
        /* @__PURE__ */ jsx("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: "navigate(path)\u3001replace(path)\u3001back()\u3001forward()\u3001go(delta)" }),
        /* @__PURE__ */ jsxs("div", { className: "mb-3 flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn9,
              onClick: () => router.navigate("/signal"),
              children: "\u53BB Signal"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn9,
              onClick: () => router.navigate("/store"),
              children: "\u53BB Store"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn9,
              onClick: () => router.replace("/context"),
              children: "replace \u5230 Context"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: btn9, onClick: () => router.back(), children: "\u540E\u9000" }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn9,
              onClick: () => router.forward(),
              children: "\u524D\u8FDB"
            }
          ),
          /* @__PURE__ */ jsx("button", { type: "button", className: btn9, onClick: () => router.go(-2), children: "go(-2)" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block5, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle5, children: "\u8F93\u5165\u8DEF\u5F84\u5E76 navigate" }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              className: "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100",
              ref: (el) => {
                pathInputEl = el;
              },
              placeholder: "/signal"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: btn9,
              onClick: () => router.navigate(pathInputEl?.value?.trim() || "/"),
              children: "\u5BFC\u822A"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: block5, children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle5, children: "\u52A8\u6001\u8DEF\u7531" }),
        /* @__PURE__ */ jsxs("p", { className: "mb-3 text-slate-600 dark:text-slate-300", children: [
          "\u8DEF\u7531\u914D\u7F6E\u4E2D\u82E5 path \u5E26\u52A8\u6001\u53C2\u6570\uFF08\u5982",
          " ",
          /* @__PURE__ */ jsx("code", { className: "rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80", children: "/user/:id" }),
          "\uFF09\uFF0C\u5339\u914D\u540E",
          " ",
          /* @__PURE__ */ jsx("code", { className: "rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80", children: "component(match)" }),
          " ",
          "\u4F1A\u6536\u5230",
          " ",
          /* @__PURE__ */ jsx("code", { className: "rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80", children: "match" }),
          " ",
          "\u5BF9\u8C61\uFF0C\u5305\u542B\uFF1A"
        ] }),
        /* @__PURE__ */ jsxs("ul", { className: "mb-3 list-inside list-disc space-y-1 font-mono text-sm text-slate-600 dark:text-slate-300", children: [
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("code", { children: "path" }),
            "\uFF1A\u8DEF\u7531\u6A21\u5F0F\uFF08\u5982 /user/:id\uFF09"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("code", { children: "fullPath" }),
            "\uFF1A\u5F53\u524D\u5B8C\u6574\u8DEF\u5F84\uFF08\u5982 /user/123\uFF09"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("code", { children: "params" }),
            "\uFF1A\u52A8\u6001\u53C2\u6570\uFF08\u5982 ",
            `{ id: "123" }`,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("code", { children: "query" }),
            "\uFF1A\u67E5\u8BE2\u4E32\u89E3\u6790\u7ED3\u679C\uFF08\u5982 ?a=1 \u2192 ",
            `{ a: "1" }`,
            "\uFF09"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-600 dark:text-slate-300", children: [
          "\u793A\u4F8B\uFF1A\u5F53\u7528\u6237\u8BBF\u95EE",
          " ",
          /* @__PURE__ */ jsx("code", { className: "rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80", children: "/user/42?tab=profile" }),
          " ",
          "\u65F6\uFF0Cmatch \u5185\u5BB9\u5982\u4E0B\u3002"
        ] }),
        /* @__PURE__ */ jsxs("ul", { className: "mt-2 list-inside list-disc space-y-1 font-mono text-sm text-slate-600 dark:text-slate-300", children: [
          /* @__PURE__ */ jsx("li", { children: "path\uFF08\u6A21\u5F0F\uFF09\uFF1A/user/:id" }),
          /* @__PURE__ */ jsx("li", { children: "fullPath\uFF1A/user/42?tab=profile" }),
          /* @__PURE__ */ jsxs("li", { children: [
            "params.id\uFF1A",
            /* @__PURE__ */ jsx("span", { className: "font-semibold text-indigo-600 dark:text-indigo-400", children: "42" })
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            "query\uFF1A",
            `{ "tab": "profile" }`
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border-l-4 border-teal-500/50 bg-teal-500/5 px-4 py-3 dark:bg-teal-500/10", children: [
        /* @__PURE__ */ jsx("h3", { className: subTitle5, children: "\u5B88\u536B\u8BF4\u660E" }),
        /* @__PURE__ */ jsxs("p", { className: "text-sm text-slate-600 dark:text-slate-300", children: [
          "beforeRoute\uFF1A\u8BBF\u95EE",
          " ",
          /* @__PURE__ */ jsx("code", { className: "rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80", children: "/router-redirect" }),
          " ",
          "\u4F1A\u88AB\u91CD\u5B9A\u5411\u5230\u672C\u9875\u3002 afterRoute\uFF1A\u6BCF\u6B21\u5BFC\u822A\u5B8C\u6210\u540E\u4F1A\u8BBE\u7F6E document.title\uFF08\u5728 main \u4E2D\u914D\u7F6E\uFF09\u3002"
        ] })
      ] })
    ] })
  ] });
}

// src/routes.tsx
var ModuleIcons = {
  core: () => /* @__PURE__ */ jsx(
    "svg",
    {
      className: "h-8 w-8 shrink-0",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx(
        "path",
        {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 1.8,
          d: "M13 10V3L4 14h7v7l9-11h-7z"
        }
      )
    }
  ),
  store: () => /* @__PURE__ */ jsx(
    "svg",
    {
      className: "h-8 w-8 shrink-0",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx(
        "path",
        {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 1.8,
          d: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
        }
      )
    }
  ),
  boundary: () => /* @__PURE__ */ jsx(
    "svg",
    {
      className: "h-8 w-8 shrink-0",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx(
        "path",
        {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 1.8,
          d: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        }
      )
    }
  ),
  directive: () => /* @__PURE__ */ jsx(
    "svg",
    {
      className: "h-8 w-8 shrink-0",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx(
        "path",
        {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 1.8,
          d: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        }
      )
    }
  ),
  reactive: () => /* @__PURE__ */ jsx(
    "svg",
    {
      className: "h-8 w-8 shrink-0",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx(
        "path",
        {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 1.8,
          d: "M4 7v10M7 4h10M7 20h10M20 7v10"
        }
      )
    }
  ),
  resource: () => /* @__PURE__ */ jsx(
    "svg",
    {
      className: "h-8 w-8 shrink-0",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx(
        "path",
        {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 1.8,
          d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        }
      )
    }
  ),
  context: () => /* @__PURE__ */ jsx(
    "svg",
    {
      className: "h-8 w-8 shrink-0",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx(
        "path",
        {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 1.8,
          d: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        }
      )
    }
  ),
  runtime: () => /* @__PURE__ */ jsx(
    "svg",
    {
      className: "h-8 w-8 shrink-0",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx(
        "path",
        {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 1.8,
          d: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        }
      )
    }
  ),
  router: () => /* @__PURE__ */ jsx(
    "svg",
    {
      className: "h-8 w-8 shrink-0",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx(
        "path",
        {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 1.8,
          d: "M13 7l5 5m0 0l-5 5m5-5H6"
        }
      )
    }
  )
};
var HOME_MODULES = [
  {
    title: "\u6838\u5FC3",
    desc: "createSignal\u3001createEffect\u3001createMemo\u3001onCleanup",
    href: "/signal",
    iconKey: "core",
    accent: "border-l-indigo-500 bg-indigo-500/5 dark:bg-indigo-500/10",
    accentText: "text-indigo-600 dark:text-indigo-400"
  },
  {
    title: "Store",
    desc: "createStore\uFF08getters / actions / persist\uFF09",
    href: "/store",
    iconKey: "store",
    accent: "border-l-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10",
    accentText: "text-emerald-600 dark:text-emerald-400"
  },
  {
    title: "Boundary",
    desc: "ErrorBoundary\u3001Suspense",
    href: "/boundary",
    iconKey: "boundary",
    accent: "border-l-amber-500 bg-amber-500/5 dark:bg-amber-500/10",
    accentText: "text-amber-600 dark:text-amber-400"
  },
  {
    title: "\u6307\u4EE4",
    desc: "vIf\u3001vElse\u3001vFor\u3001vShow\u3001vText\u3001vHtml",
    href: "/directive",
    iconKey: "directive",
    accent: "border-l-violet-500 bg-violet-500/5 dark:bg-violet-500/10",
    accentText: "text-violet-600 dark:text-violet-400"
  },
  {
    title: "Reactive",
    desc: "createReactive\u3001\u8868\u5355\u4E0E effect \u8054\u52A8",
    href: "/reactive",
    iconKey: "reactive",
    accent: "border-l-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10",
    accentText: "text-emerald-600 dark:text-emerald-400"
  },
  {
    title: "Resource",
    desc: "createResource\uFF08\u65E0/\u6709 source\uFF09",
    href: "/resource",
    iconKey: "resource",
    accent: "border-l-cyan-500 bg-cyan-500/5 dark:bg-cyan-500/10",
    accentText: "text-cyan-600 dark:text-cyan-400"
  },
  {
    title: "Context",
    desc: "createContext\u3001Provider\u3001useContext",
    href: "/context",
    iconKey: "context",
    accent: "border-l-rose-500 bg-rose-500/5 dark:bg-rose-500/10",
    accentText: "text-rose-600 dark:text-rose-400"
  },
  {
    title: "Runtime",
    desc: "createRoot\u3001render\u3001renderToString\u3001hydrate",
    href: "/runtime",
    iconKey: "runtime",
    accent: "border-l-sky-500 bg-sky-500/5 dark:bg-sky-500/10",
    accentText: "text-sky-600 dark:text-sky-400"
  },
  {
    title: "Router",
    desc: "navigate\u3001replace\u3001back/forward\u3001href\u3001\u5B88\u536B",
    href: "/router",
    iconKey: "router",
    accent: "border-l-teal-500 bg-teal-500/5 dark:bg-teal-500/10",
    accentText: "text-teal-600 dark:text-teal-400"
  }
];
function HomePage() {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-12", children: [
    /* @__PURE__ */ jsx("section", { className: "relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-indigo-50/30 to-slate-50 p-8 shadow-xl backdrop-blur dark:border-slate-600/80 dark:from-slate-800 dark:via-indigo-950/20 dark:to-slate-800/90 sm:p-12", children: /* @__PURE__ */ jsxs("div", { className: "relative z-10", children: [
      /* @__PURE__ */ jsx("p", { className: "mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400", children: "View \u6A21\u677F\u5F15\u64CE \xB7 \u591A\u9875\u9762\u793A\u4F8B" }),
      /* @__PURE__ */ jsx("h1", { className: "mb-4 text-4xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-5xl", children: "@dreamer/view" }),
      /* @__PURE__ */ jsx("p", { className: "max-w-xl text-slate-600 dark:text-slate-300 sm:text-lg leading-relaxed", children: "\u672C\u793A\u4F8B\u4F7F\u7528\u5185\u7F6E router \u5B9E\u73B0\u591A\u9875\u9762\u65E0\u5237\u65B0\u5207\u6362\uFF0C\u70B9\u51FB\u4E0B\u65B9\u6A21\u5757\u6216\u9876\u90E8\u5BFC\u822A\u8FDB\u5165\u5BF9\u5E94\u793A\u4F8B\u3002" })
    ] }) }),
    /* @__PURE__ */ jsx("section", { className: "grid gap-5 sm:grid-cols-2 lg:grid-cols-3", children: HOME_MODULES.map((mod) => {
      const Icon = ModuleIcons[mod.iconKey];
      return /* @__PURE__ */ jsxs(
        "a",
        {
          href: mod.href,
          className: "group relative flex flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-slate-300/80 dark:border-slate-600/90 dark:bg-slate-800/95 dark:hover:border-slate-500/80 border-l-4 " + mod.accent,
          children: [
            /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-start justify-between gap-3", children: [
              /* @__PURE__ */ jsx("span", { className: "block text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300", children: mod.title }),
              /* @__PURE__ */ jsx("span", { className: mod.accentText, children: Icon ? Icon() : null })
            ] }),
            /* @__PURE__ */ jsx("p", { className: "flex-1 text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-5", children: mod.desc }),
            /* @__PURE__ */ jsxs(
              "span",
              {
                className: "inline-flex items-center gap-2 self-start rounded-lg px-4 py-2 text-sm font-medium text-white shadow-md transition-all duration-200 group-hover:gap-3 group-hover:shadow-lg " + (mod.iconKey === "core" ? "bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400" : mod.iconKey === "store" ? "bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400" : mod.iconKey === "boundary" ? "bg-amber-600 hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400" : mod.iconKey === "directive" ? "bg-violet-600 hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400" : mod.iconKey === "reactive" ? "bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400" : mod.iconKey === "resource" ? "bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400" : mod.iconKey === "context" ? "bg-rose-600 hover:bg-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400" : mod.iconKey === "router" ? "bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400" : "bg-sky-600 hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400"),
                children: [
                  "\u8FDB\u5165\u793A\u4F8B",
                  /* @__PURE__ */ jsx(
                    "svg",
                    {
                      className: "h-4 w-4",
                      fill: "none",
                      stroke: "currentColor",
                      viewBox: "0 0 24 24",
                      "aria-hidden": "true",
                      children: /* @__PURE__ */ jsx(
                        "path",
                        {
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                          strokeWidth: 2,
                          d: "M9 5l7 7-7 7"
                        }
                      )
                    }
                  )
                ]
              }
            )
          ]
        },
        mod.href
      );
    }) })
  ] });
}
function NotFoundPage() {
  return /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-12 shadow-lg backdrop-blur text-center dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-16", children: [
    /* @__PURE__ */ jsx("p", { className: "mb-2 text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400", children: "\u9519\u8BEF 404" }),
    /* @__PURE__ */ jsx("h2", { className: "mb-3 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl", children: "\u9875\u9762\u672A\u627E\u5230" }),
    /* @__PURE__ */ jsx("p", { className: "mb-6 max-w-md mx-auto text-slate-600 dark:text-slate-300", children: "\u8BF7\u68C0\u67E5\u5730\u5740\u6216\u8FD4\u56DE\u9996\u9875\u7EE7\u7EED\u6D4F\u89C8\u793A\u4F8B\u3002" }),
    /* @__PURE__ */ jsxs(
      "a",
      {
        href: "/",
        className: "inline-flex items-center gap-2 rounded-xl border border-indigo-500/50 bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-indigo-400/50 dark:bg-indigo-500 dark:hover:bg-indigo-400",
        children: [
          "\u8FD4\u56DE\u9996\u9875",
          /* @__PURE__ */ jsx(
            "svg",
            {
              className: "h-4 w-4",
              fill: "none",
              stroke: "currentColor",
              viewBox: "0 0 24 24",
              children: /* @__PURE__ */ jsx(
                "path",
                {
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  strokeWidth: 2,
                  d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m0 0l-7 7-7-7m7 7V21"
                }
              )
            }
          )
        ]
      }
    )
  ] });
}
var routes = [
  { path: "/", component: (_match) => /* @__PURE__ */ jsx(HomePage, {}), meta: { title: "\u9996\u9875" } },
  {
    path: "/signal",
    component: (_match) => /* @__PURE__ */ jsx(SignalDemo, {}),
    meta: { title: "Signal" }
  },
  {
    path: "/store",
    component: (_match) => /* @__PURE__ */ jsx(StoreDemo, {}),
    meta: { title: "Store" }
  },
  {
    path: "/boundary",
    component: (_match) => /* @__PURE__ */ jsx(BoundaryDemo, {}),
    meta: { title: "Boundary" }
  },
  {
    path: "/directive",
    component: (_match) => /* @__PURE__ */ jsx(DirectiveDemo, {}),
    meta: { title: "\u6307\u4EE4" }
  },
  {
    path: "/reactive",
    component: (_match) => /* @__PURE__ */ jsx(ReactiveDemo, {}),
    meta: { title: "Reactive" }
  },
  {
    path: "/resource",
    component: (_match) => /* @__PURE__ */ jsx(ResourceDemo, {}),
    meta: { title: "Resource" }
  },
  {
    path: "/context",
    component: (_match) => /* @__PURE__ */ jsx(ContextDemo, {}),
    meta: { title: "Context" }
  },
  {
    path: "/runtime",
    component: (_match) => /* @__PURE__ */ jsx(RuntimeDemo, {}),
    meta: { title: "Runtime" }
  },
  {
    path: "/router",
    component: (_match) => /* @__PURE__ */ jsx(RouterDemo, {}),
    meta: { title: "Router" }
  }
];
var notFoundRoute = {
  path: "*",
  component: (_match) => /* @__PURE__ */ jsx(NotFoundPage, {}),
  meta: { title: "404" }
};
var navItems = routes.filter((r) => r.path !== "*").map((r) => ({
  path: r.path,
  label: r.meta?.title ?? r.path
}));

// src/App.tsx
function RoutePage(props) {
  return props.match.component(props.match);
}
function App(props) {
  const { router } = props;
  const [match, setMatch] = createSignal(router.getCurrentRoute());
  createEffect(() => {
    setMatch(router.getCurrentRoute());
    const unsub = router.subscribe(() => {
      setMatch(router.getCurrentRoute());
    });
    return unsub;
  });
  const current = match();
  if (!current) {
    return /* @__PURE__ */ jsx(Layout, { navItems, currentPath: "", children: /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-slate-200/80 bg-white/90 p-12 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-16 flex flex-col items-center justify-center min-h-[280px]", children: [
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent dark:border-indigo-400 dark:border-t-transparent",
          "aria-hidden": "true"
        }
      ),
      /* @__PURE__ */ jsx("p", { className: "mt-4 text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400", children: "\u52A0\u8F7D\u4E2D\u2026" })
    ] }) });
  }
  const pageTitle = current.meta?.title ?? current.path;
  if (typeof document !== "undefined" && document.title !== pageTitle) {
    document.title = `${pageTitle} \u2014 @dreamer/view \u793A\u4F8B`;
  }
  return /* @__PURE__ */ jsx(Layout, { navItems, currentPath: current.path, children: /* @__PURE__ */ jsx(RouterProvider, { router, children: /* @__PURE__ */ jsx(RoutePage, { match: current }) }) });
}

// src/main.tsx
var container = document.getElementById("root");
if (container) {
  const router = createRouter({
    routes,
    notFound: notFoundRoute,
    interceptLinks: true,
    beforeRoute: (to) => {
      if (to?.fullPath === "/router-redirect") return "/router";
      return true;
    },
    afterRoute: (to) => {
      const title = to?.meta?.title ?? to?.path ?? "";
      if (title && typeof document !== "undefined") {
        document.title = `${title} \u2014 @dreamer/view \u793A\u4F8B`;
      }
    }
  });
  router.start();
  createRoot(() => /* @__PURE__ */ jsx(App, { router }), container);
  container.removeAttribute("data-view-cloak");
}

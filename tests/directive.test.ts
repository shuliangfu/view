/**
 * @fileoverview 指令单元测试：vIf/vElse/vElseIf/vFor/vShow/vText/vHtml、getDirectiveValue、registerDirective
 */

import { describe, expect, it } from "@dreamer/test";
import { createSignal } from "@dreamer/view";
import {
  createBinding,
  directiveNameToCamel,
  directiveNameToKebab,
  getDirective,
  getDirectiveValue,
  getModelFromProps,
  getVElseIfValue,
  getVElseShow,
  getVForListAndFactory,
  getVHtmlValue,
  getVIfValue,
  getVShowValue,
  getVTextValue,
  hasDirective,
  hasStructuralDirective,
  isDirectiveProp,
  registerDirective,
} from "@dreamer/view/directive";

describe("directiveNameToCamel / directiveNameToKebab", () => {
  it("v-if -> vIf", () => {
    expect(directiveNameToCamel("v-if")).toBe("vIf");
  });
  it("v-else-if -> vElseIf", () => {
    expect(directiveNameToCamel("v-else-if")).toBe("vElseIf");
  });
  it("vIf -> v-if", () => {
    expect(directiveNameToKebab("vIf")).toBe("v-if");
  });
});

describe("getDirectiveValue", () => {
  it("对普通值应原样返回", () => {
    expect(getDirectiveValue(1)).toBe(1);
    expect(getDirectiveValue("a")).toBe("a");
  });
  it("对 signal getter 应求值后返回", () => {
    const [get] = createSignal(42);
    expect(getDirectiveValue(get)).toBe(42);
  });
});

describe("getVIfValue", () => {
  it("无 vIf 时视为 true", () => {
    expect(getVIfValue({})).toBe(true);
  });
  it("vIf 为 true/false 时返回布尔", () => {
    expect(getVIfValue({ vIf: true })).toBe(true);
    expect(getVIfValue({ vIf: false })).toBe(false);
  });
  it("vIf 为 getter 时求值", () => {
    const [get] = createSignal(true);
    expect(getVIfValue({ vIf: get })).toBe(true);
  });
});

describe("getVElseShow", () => {
  it("lastVIf 为 false 时 vElse 显示", () => {
    expect(getVElseShow(false)).toBe(true);
  });
  it("lastVIf 为 true 时 vElse 不显示", () => {
    expect(getVElseShow(true)).toBe(false);
  });
});

describe("getVElseIfValue", () => {
  it("无 vElseIf 时返回 false", () => {
    expect(getVElseIfValue({})).toBe(false);
  });
  it("vElseIf 为 getter 时求值", () => {
    const [get] = createSignal(true);
    expect(getVElseIfValue({ vElseIf: get })).toBe(true);
  });
});

describe("getVShowValue", () => {
  it("无 vShow 时视为 true", () => {
    expect(getVShowValue({})).toBe(true);
  });
  it("vShow 为 false 时返回 false", () => {
    expect(getVShowValue({ vShow: false })).toBe(false);
  });
});

describe("getVTextValue", () => {
  it("无 vText 时返回空串", () => {
    expect(getVTextValue({})).toBe("");
  });
  it("vText 为 getter 时求值", () => {
    const [get] = createSignal("hello");
    expect(getVTextValue({ vText: get })).toBe("hello");
  });
});

describe("getVHtmlValue", () => {
  it("无 vHtml 时返回空串", () => {
    expect(getVHtmlValue({})).toBe("");
  });
});

describe("getVForListAndFactory", () => {
  it("无 vFor 时返回 null", () => {
    expect(getVForListAndFactory({}, undefined)).toBeNull();
  });
  it("vFor 为数组时返回 list 与默认 factory", () => {
    const list = [1, 2];
    const child = { type: "span", props: {} };
    const result = getVForListAndFactory({ vFor: list }, child);
    expect(result).not.toBeNull();
    expect(result!.list).toEqual([1, 2]);
    expect(typeof result!.factory).toBe("function");
  });
  it("边界：vFor 空数组时返回 list 为空数组，不渲染列表项", () => {
    const result = getVForListAndFactory(
      { vFor: [] },
      { type: "span", props: {} },
    );
    expect(result).not.toBeNull();
    expect(result!.list).toEqual([]);
    expect(result!.list.length).toBe(0);
  });
  it("边界：vFor 非数组（如 object）时 list 被归一为空数组", () => {
    const resultObj = getVForListAndFactory(
      { vFor: { a: 1 } },
      { type: "span", props: {} },
    );
    expect(resultObj).not.toBeNull();
    expect(resultObj!.list).toEqual([]);
  });
});

describe("hasDirective / hasStructuralDirective / isDirectiveProp", () => {
  it("hasDirective 检测 props 中是否含指定指令", () => {
    expect(hasDirective({ vIf: true }, "vIf")).toBe(true);
    expect(hasDirective({ "v-if": true }, "vIf")).toBe(true);
    expect(hasDirective({}, "vIf")).toBe(false);
  });
  it("hasStructuralDirective 返回 vIf 或 vFor 或 null", () => {
    expect(hasStructuralDirective({ vIf: true })).toBe("vIf");
    expect(hasStructuralDirective({ vFor: [] })).toBe("vFor");
    expect(hasStructuralDirective({})).toBeNull();
  });
  it("isDirectiveProp 对 v 开头或 v- 开头返回 true", () => {
    expect(isDirectiveProp("vIf")).toBe(true);
    expect(isDirectiveProp("v-show")).toBe(true);
    expect(isDirectiveProp("vModel")).toBe(true);
    expect(isDirectiveProp("v-model")).toBe(true);
    expect(isDirectiveProp("className")).toBe(false);
  });
  it("hasDirective 可检测 vModel", () => {
    expect(hasDirective({ vModel: [] }, "vModel")).toBe(true);
    expect(hasDirective({ "v-model": [() => "", () => {}] }, "vModel")).toBe(
      true,
    );
  });
});

describe("registerDirective / getDirective", () => {
  it("注册后可通过 getDirective 获取", () => {
    registerDirective("v-foo", {
      mounted() {},
    });
    expect(getDirective("v-foo")).toBeDefined();
    expect(getDirective("vFoo")).toBeDefined();
  });
});

describe("createBinding", () => {
  it("应返回 value/arg/modifiers", () => {
    const b = createBinding(1, "arg1", ["mod1"]);
    expect(b.value).toBe(1);
    expect(b.arg).toBe("arg1");
    expect(b.modifiers).toEqual(["mod1"]);
  });
});

describe("getModelFromProps", () => {
  it("无 vModel/model 时返回 null", () => {
    expect(getModelFromProps({})).toBeNull();
    expect(getModelFromProps({ other: 1 })).toBeNull();
  });
  it("vModel 为 [getter, setter] 时返回该元组", () => {
    const get = () => "a";
    const set = () => {};
    const out = getModelFromProps({ vModel: [get, set] });
    expect(out).not.toBeNull();
    expect(out![0]).toBe(get);
    expect(out![1]).toBe(set);
  });
  it("model 为 [getter, setter] 时返回该元组", () => {
    const get = () => 0;
    const set = () => {};
    const out = getModelFromProps({ model: [get, set] });
    expect(out).not.toBeNull();
    expect(out![0]).toBe(get);
    expect(out![1]).toBe(set);
  });
  it("非数组或长度不足时返回 null", () => {
    expect(getModelFromProps({ vModel: null })).toBeNull();
    expect(getModelFromProps({ vModel: [() => 1] })).toBeNull();
    expect(getModelFromProps({ vModel: "x" })).toBeNull();
  });
});

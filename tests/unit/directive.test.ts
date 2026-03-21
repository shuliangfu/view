/**
 * @fileoverview 指令单元测试：vIf/vElse/vElseIf、getDirectiveValue、registerDirective、hasStructuralDirective 等
 */

import { describe, expect, it } from "@dreamer/test";
import { createSignal } from "@dreamer/view";
import {
  createBinding,
  directiveNameToCamel,
  directiveNameToKebab,
  getDirective,
  getDirectiveValue,
  getVElseIfValue,
  getVElseShow,
  getVIfValue,
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
  it("对 SignalRef 应读 .value 后返回", () => {
    const s = createSignal(42);
    expect(getDirectiveValue(s)).toBe(42);
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
  it("vIf 为 SignalRef 时求值", () => {
    const s = createSignal(true);
    expect(getVIfValue({ vIf: s })).toBe(true);
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
  it("vElseIf 为 SignalRef 时求值", () => {
    const s = createSignal(true);
    expect(getVElseIfValue({ vElseIf: s })).toBe(true);
  });
});

describe("hasDirective / hasStructuralDirective / isDirectiveProp", () => {
  it("hasDirective 检测 props 中是否含指定指令", () => {
    expect(hasDirective({ vIf: true }, "vIf")).toBe(true);
    expect(hasDirective({ "v-if": true }, "vIf")).toBe(true);
    expect(hasDirective({}, "vIf")).toBe(false);
  });
  it("hasStructuralDirective 仅识别 vIf", () => {
    expect(hasStructuralDirective({ vIf: true })).toBe("vIf");
    expect(hasStructuralDirective({ vOnce: true })).toBeNull();
    expect(hasStructuralDirective({})).toBeNull();
  });
  it("isDirectiveProp 对内置与 v- 前缀返回 true", () => {
    expect(isDirectiveProp("vIf")).toBe(true);
    expect(isDirectiveProp("v-once")).toBe(true);
    expect(isDirectiveProp("className")).toBe(false);
  });
  it("hasDirective 可检测 vElse 等键", () => {
    expect(hasDirective({ vElse: true }, "vElse")).toBe(true);
    expect(hasDirective({ "v-else": false }, "vElse")).toBe(true);
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

/**
 * 文本类 `input` / `textarea` 可与受控 `value` 并列的**响应式字符串**属性白名单。
 * 供 {@link canPatchIntrinsic} 放行与 `vnode-mount` 内 effect 同步共用，避免多一个 getter 就整段 detach 失焦。
 *
 * @module @dreamer/view/compiler/tc-reactive
 */

/**
 * JSX prop 名集合（含常见大小写变体）；写入 DOM 时用 `spread-intrinsic` 的 `domAttributeNameFromPropKey`。
 */
export const REACTIVE_STRING_PROP_KEYS_FOR_TEXT_CONTROL: ReadonlySet<string> =
  new Set([
    "maxLength",
    "maxlength",
    "minLength",
    "minlength",
    "pattern",
    "name",
    "title",
    "id",
    /** 关联 `<datalist id>` */
    "list",
    /** `type="file"` 等 */
    "accept",
    /** `type="number"` / `range` / `date` 等 */
    "step",
    "tabIndex",
    "tabindex",
    "autoComplete",
    "autocomplete",
    "inputMode",
    "inputmode",
    /** 移动端键盘行为；React 驼峰见 `JSX_TO_HTML_ATTR` */
    "autocapitalize",
    "autoCapitalize",
    /** `form="otherFormId"` 挂到外表单 */
    "form",
    "enterKeyHint",
    "enterkeyhint",
  ]);

/**
 * 是否属于文本控件上允许参与本征 patch 的响应式字符串 prop。
 *
 * @param propKey - VNode.props 键名
 */
export function isReactiveStringPropKeyForTextControl(
  propKey: string,
): boolean {
  return REACTIVE_STRING_PROP_KEYS_FOR_TEXT_CONTROL.has(propKey);
}

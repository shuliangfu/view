/**
 * @module integrations/form
 * @description 轻量受控表单：双向绑定、`errors` 槽位、可选规则与 `validateOn`、整表/单字段校验、`handleSubmit`。
 *
 * **支持的功能：**
 * - ✅ createForm(initial, options?) — 第二参可选，无规则时与旧版行为兼容
 * - ✅ field() — value + onInput；在 `validateOn` 含 `blur` 且该字段有规则时附带 onBlur
 * - ✅ rules — 每字段 `(value, data) => string | null`
 * - ✅ validateOn — `change` | `blur` | `submit`（可多选；默认仅 `submit`）
 * - ✅ validate() / validateField(name)
 * - ✅ handleSubmit(onValid, onInvalid?)
 * - ✅ produce / reset / updateField（updateField 在 change 模式下会触发单字段校验）
 *
 * @usage
 * const form = createForm({ u: "" }, { rules: { u: (v) => v ? null : "必填" } });
 * <input {...form.field("u")} />
 */

import { batch } from "../scheduler/batch.ts";
import { createStore, produce, type Store } from "../reactivity/store.ts";

/** 触发校验的时机 */
export type FormValidateOn = "change" | "blur" | "submit";

/** 单字段规则：返回 null 表示通过，否则为错误文案 */
export type FormFieldRule<
  T extends Record<string, unknown>,
  K extends keyof T,
> = (
  value: T[K],
  data: T,
) => string | null;

/** createForm 第二参 */
export interface CreateFormOptions<T extends Record<string, unknown>> {
  /** 各字段校验函数；未声明的字段不参与规则校验（errors 在 validate 时会被置空） */
  rules?: {
    [K in keyof T]?: FormFieldRule<T, K>;
  };
  /**
   * 何时自动校验。
   * - `submit`：仅调用 `validate()` / `handleSubmit` 时
   * - `change`：`onInput`（及 `updateField`）后对该字段校验（仅当该字段有 rule）
   * - `blur`：`field()` 返回对象含 `onBlur`（仅当该字段有 rule）
   * 默认：`["submit"]`
   */
  validateOn?: FormValidateOn | FormValidateOn[];
}

/**
 * 将 validateOn 规范为集合；未传则仅 submit。
 */
function toValidateOnSet(
  v: FormValidateOn | FormValidateOn[] | undefined,
): Set<FormValidateOn> {
  if (v == null) return new Set<FormValidateOn>(["submit"]);
  const list = Array.isArray(v) ? v : [v];
  return new Set(list);
}

/**
 * 创建一个受控表单状态。
 * @param initialValues 初始字段表（键集决定 errors 形状）
 * @param options 可选：规则与校验时机
 */
export function createForm<T extends Record<string, unknown>>(
  initialValues: T,
  options?: CreateFormOptions<T>,
) {
  const validateOnSet = toValidateOnSet(options?.validateOn);

  /** 数据 Store */
  const data = createStore(initialValues) as Store<T>;
  const setData = data.setState;
  type ErrMap = Record<keyof T, string | null>;
  /** 与 initialValues 同键的错误文案 */
  const errors = createStore(
    Object.keys(initialValues).reduce(
      (acc, key) => ({ ...acc, [key]: null }),
      {} as ErrMap,
    ),
  ) as Store<ErrMap>;
  const setErrors = errors.setState;

  /**
   * 当前 data 的浅拷贝快照（供提交回调使用，避免把 Proxy 直接外抛）。
   */
  const getDataSnapshot = (): T => {
    const out = {} as T;
    for (const key of Object.keys(initialValues) as (keyof T)[]) {
      out[key] = data[key];
    }
    return out;
  };

  /**
   * 对单字段运行规则；无规则则清空该字段 error 并视为通过。
   */
  const validateField = (name: keyof T): boolean => {
    const rule = options?.rules?.[name];
    if (!rule) {
      setErrors(name, null);
      return true;
    }
    const msg = rule(data[name] as T[typeof name], data as T);
    setErrors(name, msg);
    return msg == null;
  };

  /**
   * 整表校验：无 rules 时清空所有 error 并返回 true。
   * 有 rules 时：无 rule 的字段 error 置 null；有 rule 的字段跑规则。
   */
  const validate = (): boolean => {
    if (!options?.rules) {
      batch(() => {
        for (const key in initialValues) {
          setErrors(key as keyof T, null);
        }
      });
      return true;
    }
    let ok = true;
    batch(() => {
      for (const key in initialValues) {
        const k = key as keyof T;
        const rule = options.rules![k];
        if (!rule) {
          setErrors(k, null);
          continue;
        }
        const msg = rule(data[k] as T[typeof k], data as T);
        setErrors(k, msg);
        if (msg != null) ok = false;
      }
    });
    return ok;
  };

  /**
   * 封装 submit：preventDefault + validate + 回调。
   */
  const handleSubmit = (
    onValid: (data: T) => void | Promise<void>,
    onInvalid?: () => void,
  ) => {
    return (e: Event) => {
      e.preventDefault();
      if (!validate()) {
        onInvalid?.();
        return;
      }
      void Promise.resolve(onValid(getDataSnapshot()));
    };
  };

  /**
   * 生成双向绑定属性；按需附带 onBlur。
   */
  const field = (name: keyof T) => {
    const base: {
      value: () => unknown;
      onInput: (e: InputEvent) => void;
      onBlur?: (e: FocusEvent) => void;
    } = {
      value: () => data[name],
      onInput: (e: InputEvent) => {
        const val = (e.target as HTMLInputElement).value;
        setData(name, val as unknown as T[keyof T]);
        if (validateOnSet.has("change") && options?.rules?.[name]) {
          validateField(name);
        }
      },
    };

    if (validateOnSet.has("blur") && options?.rules?.[name]) {
      base.onBlur = (_e: FocusEvent) => {
        validateField(name);
      };
    }

    return base;
  };

  /**
   * 更新字段；在 validateOn 含 change 且该字段有 rule 时会触发单字段校验。
   */
  const updateField = (name: keyof T, val: T[keyof T]) => {
    setData(name, val);
    if (validateOnSet.has("change") && options?.rules?.[name]) {
      validateField(name);
    }
  };

  /**
   * 重置为初始值并清空 errors。
   */
  const reset = () => {
    for (const key in initialValues) {
      setData(key as keyof T, initialValues[key]);
    }
    for (const key in initialValues) {
      setErrors(key as keyof T, null);
    }
  };

  return {
    data,
    errors,
    field,
    updateField,
    reset,
    produce: (fn: (state: T) => void) => setData(produce(fn)),
    validate,
    validateField,
    handleSubmit,
  };
}

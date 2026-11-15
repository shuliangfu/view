/**
 * 解析简单的 JS 对象／数组字面量（仅 JSON 子集 + 未加引号的键 + 单引号 + 尾逗号）。
 * 用于构建期读取 `export const metadata = {…}`，避免 `new Function`。
 *
 * @module server/utils/static-literal
 */

export class StaticLiteralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaticLiteralError";
  }
}

/**
 * 把一段静态字面量解析成可 JSON 序列化的值。
 * 不接受标识符、函数、模板字符串、注释或计算属性。
 */
export function parseStaticLiteral(source: string): unknown {
  const p = new Parser(source);
  const value = p.parseValue();
  p.skipWs();
  if (p.pos < p.src.length) {
    throw new StaticLiteralError(
      `unexpected trailing input at ${p.pos}`,
    );
  }
  return value;
}

class Parser {
  readonly src: string;
  pos = 0;

  constructor(src: string) {
    this.src = src;
  }

  skipWs(): void {
    const s = this.src;
    while (this.pos < s.length) {
      const c = s.charCodeAt(this.pos);
      if (c === 32 || c === 9 || c === 10 || c === 13) this.pos++;
      else break;
    }
  }

  peek(): string {
    return this.src[this.pos] ?? "";
  }

  parseValue(): unknown {
    this.skipWs();
    const c = this.peek();
    if (c === "{") return this.parseObject();
    if (c === "[") return this.parseArray();
    if (c === "'" || c === '"') return this.parseString();
    if (c === "-" || (c >= "0" && c <= "9")) return this.parseNumber();
    return this.parseKeyword();
  }

  parseObject(): Record<string, unknown> {
    this.pos++; // {
    const out: Record<string, unknown> = {};
    this.skipWs();
    if (this.peek() === "}") {
      this.pos++;
      return out;
    }
    while (this.pos < this.src.length) {
      this.skipWs();
      const key = this.parseKey();
      this.skipWs();
      if (this.peek() !== ":") {
        throw new StaticLiteralError(`expected ':' after key at ${this.pos}`);
      }
      this.pos++;
      if (key !== "__proto__" && key !== "prototype" && key !== "constructor") {
        out[key] = this.parseValue();
      } else {
        this.parseValue();
      }
      this.skipWs();
      const next = this.peek();
      if (next === ",") {
        this.pos++;
        this.skipWs();
        if (this.peek() === "}") {
          this.pos++;
          return out;
        }
        continue;
      }
      if (next === "}") {
        this.pos++;
        return out;
      }
      throw new StaticLiteralError(`expected ',' or '}' at ${this.pos}`);
    }
    throw new StaticLiteralError("unterminated object");
  }

  parseArray(): unknown[] {
    this.pos++; // [
    const out: unknown[] = [];
    this.skipWs();
    if (this.peek() === "]") {
      this.pos++;
      return out;
    }
    while (this.pos < this.src.length) {
      out.push(this.parseValue());
      this.skipWs();
      const next = this.peek();
      if (next === ",") {
        this.pos++;
        this.skipWs();
        if (this.peek() === "]") {
          this.pos++;
          return out;
        }
        continue;
      }
      if (next === "]") {
        this.pos++;
        return out;
      }
      throw new StaticLiteralError(`expected ',' or ']' at ${this.pos}`);
    }
    throw new StaticLiteralError("unterminated array");
  }

  parseKey(): string {
    this.skipWs();
    const c = this.peek();
    if (c === "'" || c === '"') return this.parseString();
    const start = this.pos;
    if (!isIdentStart(this.src.charCodeAt(start))) {
      throw new StaticLiteralError(`expected property name at ${this.pos}`);
    }
    this.pos++;
    while (
      this.pos < this.src.length && isIdentPart(this.src.charCodeAt(this.pos))
    ) {
      this.pos++;
    }
    return this.src.slice(start, this.pos);
  }

  parseString(): string {
    const quote = this.peek();
    this.pos++;
    let out = "";
    const s = this.src;
    while (this.pos < s.length) {
      const ch = s[this.pos]!;
      if (ch === quote) {
        this.pos++;
        return out;
      }
      if (ch === "\\") {
        this.pos++;
        const e = s[this.pos];
        if (e == null) break;
        if (e === "n") out += "\n";
        else if (e === "t") out += "\t";
        else if (e === "r") out += "\r";
        else if (e === "u") {
          const hex = s.slice(this.pos + 1, this.pos + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            throw new StaticLiteralError(`bad unicode escape at ${this.pos}`);
          }
          out += String.fromCharCode(parseInt(hex, 16));
          this.pos += 4;
        } else {
          out += e;
        }
        this.pos++;
        continue;
      }
      if (ch === "\n") {
        throw new StaticLiteralError("unterminated string");
      }
      out += ch;
      this.pos++;
    }
    throw new StaticLiteralError("unterminated string");
  }

  parseNumber(): number {
    const start = this.pos;
    if (this.peek() === "-") this.pos++;
    const s = this.src;
    if (s[this.pos] === "0") this.pos++;
    else {
      if (this.pos >= s.length || s[this.pos]! < "1" || s[this.pos]! > "9") {
        throw new StaticLiteralError(`bad number at ${start}`);
      }
      while (
        this.pos < s.length && s[this.pos]! >= "0" && s[this.pos]! <= "9"
      ) {
        this.pos++;
      }
    }
    if (s[this.pos] === ".") {
      this.pos++;
      if (this.pos >= s.length || s[this.pos]! < "0" || s[this.pos]! > "9") {
        throw new StaticLiteralError(`bad number at ${start}`);
      }
      while (
        this.pos < s.length && s[this.pos]! >= "0" && s[this.pos]! <= "9"
      ) {
        this.pos++;
      }
    }
    const c = s[this.pos];
    if (c === "e" || c === "E") {
      this.pos++;
      if (s[this.pos] === "+" || s[this.pos] === "-") this.pos++;
      if (this.pos >= s.length || s[this.pos]! < "0" || s[this.pos]! > "9") {
        throw new StaticLiteralError(`bad number at ${start}`);
      }
      while (
        this.pos < s.length && s[this.pos]! >= "0" && s[this.pos]! <= "9"
      ) {
        this.pos++;
      }
    }
    const n = Number(s.slice(start, this.pos));
    if (!Number.isFinite(n)) {
      throw new StaticLiteralError(`bad number at ${start}`);
    }
    return n;
  }

  parseKeyword(): unknown {
    const s = this.src;
    if (
      s.startsWith("true", this.pos) && !isIdentPart(s.charCodeAt(this.pos + 4))
    ) {
      this.pos += 4;
      return true;
    }
    if (
      s.startsWith("false", this.pos) &&
      !isIdentPart(s.charCodeAt(this.pos + 5))
    ) {
      this.pos += 5;
      return false;
    }
    if (
      s.startsWith("null", this.pos) && !isIdentPart(s.charCodeAt(this.pos + 4))
    ) {
      this.pos += 4;
      return null;
    }
    throw new StaticLiteralError(`unexpected token at ${this.pos}`);
  }
}

function isIdentStart(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
}

function isIdentPart(c: number): boolean {
  return isIdentStart(c) || (c >= 48 && c <= 57);
}

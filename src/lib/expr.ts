/**
 * Expressions, for the tags that take one.
 *
 * The line grammar hands a tag its arguments as plain tokens and knows nothing
 * about them. A tag that wants an expression joins those tokens back up and
 * brings them here, which is why `#if x < (3 + y)` needs no change to the line
 * grammar at all -- expressions are matched from their own start rule.
 *
 * A bare word is a **variable**; a string is written in quotes. It cannot be
 * the other way round: `x < (3 + y)` is only meaningful if `x` and `y` name
 * values rather than standing for themselves.
 */

import grammar from "./grammar.ohm-bundle.js";
import type { TerminalSemantics } from "./grammar.ohm-bundle.js";

/** A value a variable can hold, tagged with what it is. */
export type Value =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean };

export type Expr =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "var"; name: string }
  | { kind: "unary"; op: "-" | "not"; operand: Expr }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr };

export type BinaryOp =
  | "+" | "-" | "*" | "/"
  | "=" | "!=" | "<" | "<=" | ">" | ">="
  | "and" | "or";

export const num = (value: number): Value => ({ kind: "number", value });
export const str = (value: string): Value => ({ kind: "string", value });
export const bool = (value: boolean): Value => ({ kind: "boolean", value });

// --- parsing --------------------------------------------------------------

const semantics: TerminalSemantics = grammar.createSemantics();

semantics.addOperation<any>("expr", {
  Expr: (e) => e.expr(),
  OrExpr: (e) => e.expr(),
  AndExpr: (e) => e.expr(),
  NotExpr: (e) => e.expr(),
  CompExpr: (e) => e.expr(),
  AddExpr: (e) => e.expr(),
  MulExpr: (e) => e.expr(),
  Unary: (e) => e.expr(),
  Primary: (e) => e.expr(),

  OrExpr_or: (l, _op, r) => binary("or", l, r),
  AndExpr_and: (l, _op, r) => binary("and", l, r),
  CompExpr_compare: (l, op, r) => binary(op.sourceString as BinaryOp, l, r),
  AddExpr_add: (l, op, r) => binary(op.sourceString as BinaryOp, l, r),
  MulExpr_mul: (l, op, r) => binary(op.sourceString as BinaryOp, l, r),

  NotExpr_not: (_not, operand) => ({ kind: "unary", op: "not", operand: operand.expr() }),
  Unary_negate: (_minus, operand) => ({ kind: "unary", op: "-", operand: operand.expr() }),
  Primary_paren: (_open, e, _close) => e.expr(),

  number(_digits, _dot, _decimals) {
    return { kind: "number", value: parseFloat(this.sourceString) };
  },
  string(_open, chars, _close) {
    return { kind: "string", value: chars.sourceString };
  },
  boolean(word) {
    return { kind: "boolean", value: word.sourceString === "true" };
  },
  varRef(name) {
    return { kind: "var", name: name.sourceString };
  },
});

function binary(op: BinaryOp, left: any, right: any): Expr {
  return { kind: "binary", op, left: left.expr(), right: right.expr() };
}

/** Null when the source is not a well-formed expression. */
export function parseExpr(source: string): Expr | null {
  const match = grammar.match(source, "Expr");
  return match.succeeded() ? (semantics(match).expr() as Expr) : null;
}

// --- evaluation -----------------------------------------------------------

export type Scope = ReadonlyMap<string, Value>;

/**
 * Undefined means "no answer": an unset variable, or an operator given types
 * it has nothing to say about (`"low" < 3`). It spreads -- any expression
 * built on no answer is itself no answer -- which is what makes an unset
 * variable match nothing rather than accidentally matching something.
 */
export function evaluate(expr: Expr, scope: Scope): Value | undefined {
  switch (expr.kind) {
    case "number":
    case "string":
    case "boolean":
      return expr;
    case "var":
      return scope.get(expr.name);
    case "unary":
      return unary(expr.op, evaluate(expr.operand, scope));
    case "binary":
      return binaryValue(expr, scope);
  }
}

function unary(op: "-" | "not", operand: Value | undefined): Value | undefined {
  if (!operand) return undefined;
  if (op === "-") return operand.kind === "number" ? num(-operand.value) : undefined;
  return operand.kind === "boolean" ? bool(!operand.value) : undefined;
}

function binaryValue(
  expr: { op: BinaryOp; left: Expr; right: Expr },
  scope: Scope
): Value | undefined {
  const { op } = expr;

  // `and` and `or` settle what they can without the other side, so a false
  // condition beside an unset variable is still false rather than no answer.
  if (op === "and" || op === "or") {
    const left = evaluate(expr.left, scope);
    if (left?.kind === "boolean" && left.value === (op === "or")) return left;
    const right = evaluate(expr.right, scope);
    if (left === undefined || right === undefined) return undefined;
    if (left.kind !== "boolean" || right.kind !== "boolean") return undefined;
    return bool(op === "and" ? left.value && right.value : left.value || right.value);
  }

  const left = evaluate(expr.left, scope);
  const right = evaluate(expr.right, scope);
  if (left === undefined || right === undefined) return undefined;

  switch (op) {
    case "=":
      return bool(equal(left, right));
    case "!=":
      return bool(!equal(left, right));
    case "+":
      // The one operator with a meaning for two strings, because joining text
      // is what a terminal does most.
      if (left.kind === "string" && right.kind === "string") {
        return str(left.value + right.value);
      }
      return arithmetic(op, left, right);
    default:
      return left.kind === "number" && right.kind === "number"
        ? compareOrCompute(op, left.value, right.value)
        : undefined;
  }
}

/** Values of different kinds are never equal; no coercion, in either direction. */
function equal(left: Value, right: Value): boolean {
  return left.kind === right.kind && left.value === right.value;
}

function arithmetic(op: BinaryOp, left: Value, right: Value): Value | undefined {
  return left.kind === "number" && right.kind === "number"
    ? compareOrCompute(op, left.value, right.value)
    : undefined;
}

function compareOrCompute(op: BinaryOp, a: number, b: number): Value | undefined {
  switch (op) {
    case "+": return num(a + b);
    case "-": return num(a - b);
    case "*": return num(a * b);
    case "/": return b === 0 ? undefined : num(a / b);
    case "<": return bool(a < b);
    case "<=": return bool(a <= b);
    case ">": return bool(a > b);
    case ">=": return bool(a >= b);
    default: return undefined;
  }
}

// --- display --------------------------------------------------------------

/**
 * How a value reaches the screen. Whole numbers print without a point, and the
 * rest are rounded off the end so `0.1 + 0.2` reads as `0.3` rather than as
 * seventeen decimal places of binary floating point.
 */
export function formatValue(value: Value): string {
  if (value.kind === "number") {
    return Number.isInteger(value.value)
      ? String(value.value)
      : String(Number(value.value.toFixed(10)));
  }
  if (value.kind === "boolean") return value.value ? "true" : "false";
  return value.value;
}

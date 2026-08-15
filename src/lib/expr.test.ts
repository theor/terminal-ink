import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseExpr,
  evaluate,
  formatValue,
  num,
  str,
  bool,
  type Value,
} from "./expr.ts";

const scope = new Map<string, Value>([
  ["x", num(10)],
  ["y", num(4)],
  ["name", str("Reyes")],
  ["armed", bool(true)],
]);

/** Evaluates source against the scope above. Undefined means "no answer". */
function run(source: string): Value | undefined {
  const expr = parseExpr(source);
  assert.ok(expr, `expected ${JSON.stringify(source)} to parse`);
  return evaluate(expr, scope);
}

// --- parsing --------------------------------------------------------------

test("a bare word is a variable and a quoted word is a string", () => {
  assert.deepEqual(parseExpr("coolant"), { kind: "var", name: "coolant" });
  assert.deepEqual(parseExpr('"coolant"'), { kind: "string", value: "coolant" });
});

test("builds a tree with the usual precedence", () => {
  assert.deepEqual(parseExpr("1 + 2 * 3"), {
    kind: "binary",
    op: "+",
    left: { kind: "number", value: 1 },
    right: {
      kind: "binary",
      op: "*",
      left: { kind: "number", value: 2 },
      right: { kind: "number", value: 3 },
    },
  });
});

test("parentheses override precedence", () => {
  assert.equal(run("(1 + 2) * 3")?.value, 9);
  assert.equal(run("1 + 2 * 3")?.value, 7);
});

test("rejects what is not an expression", () => {
  for (const bad of ["1 +", "(1 + 2", ")", "and = 1", '"unclosed', "* 3"]) {
    assert.equal(parseExpr(bad), null, bad);
  }
});

test("keywords are not variable names", () => {
  assert.deepEqual(parseExpr("true"), { kind: "boolean", value: true });
  assert.deepEqual(parseExpr("trueish"), { kind: "var", name: "trueish" });
  assert.deepEqual(parseExpr("android"), { kind: "var", name: "android" });
});

// --- arithmetic -----------------------------------------------------------

test("does arithmetic, including the example this was built for", () => {
  assert.deepEqual(run("x < (3 + y)"), bool(false), "10 < 7");
  assert.deepEqual(run("y < (3 + y)"), bool(true), "4 < 7");
  assert.deepEqual(run("x * y - 1"), num(39));
  assert.deepEqual(run("-y + 1"), num(-3));
  assert.deepEqual(run("x / y"), num(2.5));
});

test("dividing by zero has no answer rather than infinity", () => {
  assert.equal(run("x / 0"), undefined);
});

test("+ joins two strings, and refuses a string and a number", () => {
  assert.deepEqual(run('name + " out"'), str("Reyes out"));
  assert.equal(run('name + 1'), undefined);
});

// --- comparison -----------------------------------------------------------

test("compares numbers", () => {
  assert.deepEqual(run("x > y"), bool(true));
  assert.deepEqual(run("x >= 10"), bool(true));
  assert.deepEqual(run("x <= 9"), bool(false));
  assert.deepEqual(run("x != y"), bool(true));
});

test("values of different kinds are never equal", () => {
  assert.deepEqual(run('x = "10"'), bool(false), "the number 10 is not the text 10");
  assert.deepEqual(run('name = "Reyes"'), bool(true));
});

test("ordering has no answer for anything but numbers", () => {
  assert.equal(run('name < "Zed"'), undefined);
  assert.equal(run("armed > 1"), undefined);
});

// --- and, or, not ---------------------------------------------------------

test("combines conditions", () => {
  assert.deepEqual(run('armed and name = "Reyes"'), bool(true));
  assert.deepEqual(run("armed and x < y"), bool(false));
  assert.deepEqual(run("armed or x < y"), bool(true));
  assert.deepEqual(run("not armed"), bool(false));
  assert.deepEqual(run("not (x < y)"), bool(true));
});

test("and and or settle what they can without the other side", () => {
  // `false and <unset>` is false, not "no answer" -- the unset half cannot
  // change the outcome, so it does not get a say.
  assert.deepEqual(run("x < y and missing"), bool(false));
  assert.deepEqual(run("armed or missing"), bool(true));
  assert.equal(run("armed and missing"), undefined, "here it does get a say");
});

// --- no answer ------------------------------------------------------------

test("an unset variable spreads no answer through the whole expression", () => {
  assert.equal(run("missing"), undefined);
  assert.equal(run("missing + 1"), undefined);
  assert.equal(run('missing = "low"'), undefined);
  assert.equal(run("not missing"), undefined);
  assert.equal(run("(missing + 1) * 2"), undefined);
});

// --- display --------------------------------------------------------------

test("formats a value the way a terminal should print it", () => {
  assert.equal(formatValue(num(7)), "7");
  assert.equal(formatValue(num(2.5)), "2.5");
  assert.equal(formatValue(num(-3)), "-3");
  assert.equal(formatValue(str("burning bright")), "burning bright");
  assert.equal(formatValue(bool(true)), "true");
});

test("floating point noise does not reach the screen", () => {
  const sum = run("0.1 + 0.2")!;
  assert.equal(String(sum.value), "0.30000000000000004", "the arithmetic is plain IEEE");
  assert.equal(formatValue(sum), "0.3", "but what gets printed is not");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "./Parser.ts";
import {
  TAGS,
  tagSpec,
  tagValues,
  positionsOf,
  type TerminalUI,
  type Vars,
} from "./tags.ts";
import { parseExpr, str } from "./expr.ts";

/** Records what the tags asked the display to do, in order. */
function fakeUI() {
  const calls: string[] = [];
  const ui: TerminalUI = {
    clear: () => void calls.push("clear"),
    setSpeed: (ms) => void calls.push(`speed ${ms}`),
    setTheme: (name) => void calls.push(`theme ${name}`),
    asHeading: () => void calls.push("heading"),
    wait: async (ms) => void calls.push(`wait ${ms}`),
  };
  return { calls, ui };
}

/**
 * The same order Terminal.svelte drains an output in: everything `before`, the
 * line itself, then everything `after`.
 */
async function draw(source: string) {
  const tags = parse(source).blocks[0].children[0].tags;
  const { calls, ui } = fakeUI();
  for (const phase of ["before", "line", "after"] as const) {
    if (phase === "line") {
      calls.push("print");
      continue;
    }
    for (const tag of tags) {
      const spec = tagSpec(tag.name);
      if (spec?.view?.phase !== phase) continue;
      const values = spec.bind(tag.args);
      if (values) await spec.view.run(ui, values);
    }
  }
  return calls;
}

test("every tag declares how it is written, and rejects what it is not", () => {
  for (const spec of TAGS) {
    assert.ok(spec.syntax, `${spec.name} has no syntax line`);
    // Nine arguments is not a shape any tag wants, so `bind` must refuse it --
    // otherwise a tag would quietly accept nonsense.
    assert.equal(
      spec.bind(["a", "b", "c", "d", "e", "f", "g", "h", "i"]),
      null,
      `${spec.name} accepts arguments it should not`
    );
  }
});

test("an assignment needs its =, and parses the rest as an expression", () => {
  assert.deepEqual(tagValues("set", ["x", "=", '"a', 'b"']), {
    name: "x",
    value: { kind: "string", value: "a b" },
  });
  assert.equal(tagValues("set", ["x", "a"]), null, "no =");
  assert.equal(tagValues("set", ["x", "="]), null, "no value");
  assert.equal(tagValues("set", ["x"]), null);
  assert.equal(tagValues("set", ["x", "=", "1", "+"]), null, "a broken expression");
  assert.equal(tagValues("nonsense", ["x", "=", "y"]), null, "unknown tag");
});

test("#if binds to the whole expression, with no name in front", () => {
  assert.deepEqual(tagValues("if", ["x", "<", "3"]), {
    kind: "binary",
    op: "<",
    left: { kind: "var", name: "x" },
    right: { kind: "number", value: 3 },
  });
  assert.equal(tagValues("if", []), null);
  assert.equal(tagValues("if", ["x", "<"]), null);
});

test("a tag does something, or it should not be in the registry", () => {
  for (const spec of TAGS) {
    assert.ok(
      spec.apply || spec.allows || spec.view || spec.gate,
      `${spec.name} is registered but has no effect`
    );
  }
});

// --- the display ----------------------------------------------------------

test("#clear, #speed and #theme run before the line they sit on", async () => {
  assert.deepEqual(await draw("= main\n  Booting #clear #speed 40 #theme library\n"), [
    "clear",
    "speed 40",
    "theme library",
    "print",
  ]);
});

test("#delay runs after the line has been printed", async () => {
  assert.deepEqual(await draw("= main\n  Booting #delay 800\n"), ["print", "wait 800"]);
});

test("a bare #delay waits the default", async () => {
  assert.deepEqual(await draw("= main\n  Booting #delay\n"), ["print", "wait 1500"]);
});

test("#title marks the line as a heading before it is printed", async () => {
  assert.deepEqual(await draw("= main\n  GRETA BASE #title\n"), ["heading", "print"]);
});

test("the display is not touched by a tag missing its argument", async () => {
  // A story that fails to parse still runs, so the hooks stay defensive.
  assert.deepEqual(await draw("= main\n  Booting #speed #theme\n"), ["print"]);
});

// --- story state ----------------------------------------------------------

test("#set is the tag that changes story state", () => {
  const stateful = TAGS.filter((s) => s.apply).map((s) => s.name);
  assert.deepEqual(stateful, ["set"]);

  const vars: Vars = new Map();
  tagSpec("set")!.apply!(vars, tagValues("set", ["candle", "=", '"burning', 'bright"']));
  assert.deepEqual(vars.get("candle"), { kind: "string", value: "burning bright" });
});

test("#password is the tag that gates", () => {
  assert.deepEqual(
    TAGS.filter((s) => s.gate).map((s) => s.name),
    ["password"]
  );
});

test("a tag restricted to some positions says which", () => {
  assert.deepEqual(positionsOf(tagSpec("title")!), ["text"]);
  assert.equal(positionsOf(tagSpec("set")!).length, 5, "#set works anywhere");
  assert.ok(
    !positionsOf(tagSpec("if")!).includes("header"),
    "#if has no meaning on a block header"
  );
});

test("#if is the tag that decides whether a line runs", () => {
  const deciding = TAGS.filter((s) => s.allows).map((s) => s.name);
  assert.deepEqual(deciding, ["if"]);

  const allows = tagSpec("if")!.allows!;
  const vars: Vars = new Map([["coolant", str("low")]]);
  const asks = (src: string) => allows(vars, parseExpr(src)!);

  assert.equal(asks('coolant = "low"'), true);
  assert.equal(asks('coolant = "fine"'), false);
  assert.equal(asks('missing = "low"'), false, "an unset variable matches nothing");
  assert.equal(asks("coolant"), false, "a string is not a yes");
});

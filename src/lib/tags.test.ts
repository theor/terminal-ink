import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "./Parser.ts";
import { TAGS, tagSpec, positionsOf, type TerminalUI, type Vars } from "./tags.ts";

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
      const view = tagSpec(tag.name)?.view;
      if (view?.phase === phase) await view.run(ui, tag.args);
    }
  }
  return calls;
}

test("every tag declares how it is written", () => {
  for (const spec of TAGS) {
    assert.ok(spec.syntax, `${spec.name} has no syntax line`);
    assert.ok(
      spec.shape === "pair" || spec.arity,
      `${spec.name} takes arguments but declares no arity`
    );
  }
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
  tagSpec("set")!.apply!(vars, ["candle", "burning bright"]);
  assert.equal(vars.get("candle"), "burning bright");
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
  const vars: Vars = new Map([["coolant", "low"]]);
  assert.equal(allows(vars, ["coolant", "low"]), true);
  assert.equal(allows(vars, ["coolant", "fine"]), false);
  assert.equal(allows(vars, ["missing", "low"]), false, "an unset variable matches nothing");
});

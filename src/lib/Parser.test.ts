import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parse,
  segmentsToString,
  stringify,
  IMPLICIT_BLOCK,
  type ChoiceNode,
  type Node,
  type TextNode,
} from "./Parser.ts";

/** Shorthand: the block with the given name, asserted to exist. */
function block(source: string, name: string) {
  const story = parse(source);
  const b = story.byName.get(name);
  assert.ok(b, `no block named ${name}`);
  return b;
}

function texts(nodes: Node[]): string[] {
  return nodes
    .filter((n): n is TextNode => n.kind === "text")
    .map((n) => segmentsToString(n.segments));
}

test("collects blocks by name", () => {
  const story = parse("= boot\n= main\n= comms\n");
  assert.deepEqual(story.blocks.map((b) => b.name), ["boot", "main", "comms"]);
  assert.equal(story.errors.length, 0);
});

test("content before any header lands in an implicit block", () => {
  const story = parse("BOOTING\n* Continue\n");
  assert.deepEqual(story.blocks.map((b) => b.name), [IMPLICIT_BLOCK]);
  assert.equal(story.blocks[0].children.length, 2);
});

test("nests children by indentation", () => {
  const b = block(
    [
      "= main",
      "  Header",
      "  * Diagnostics",
      "    Generator off",
      "    * Deeper",
      "      Reactor cold",
      "  * Comms",
      "    Comms off",
    ].join("\n"),
    "main"
  );

  assert.deepEqual(texts(b.children), ["Header"]);
  const [, diagnostics, comms] = b.children as [Node, ChoiceNode, ChoiceNode];

  assert.equal(segmentsToString(diagnostics.label), "Diagnostics");
  assert.deepEqual(texts(diagnostics.children), ["Generator off"]);

  const deeper = diagnostics.children[1] as ChoiceNode;
  assert.equal(deeper.kind, "choice");
  assert.deepEqual(texts(deeper.children), ["Reactor cold"]);

  // `* Comms` dedents back out of both open choices.
  assert.equal(segmentsToString(comms.label), "Comms");
  assert.deepEqual(texts(comms.children), ["Comms off"]);
});

test("a blank line does not close an open choice", () => {
  const b = block(
    ["= main", "  * Diagnostics", "    Generator off", "", "    Reactor cold"].join("\n"),
    "main"
  );
  const choice = b.children[0] as ChoiceNode;
  assert.deepEqual(texts(choice.children), ["Generator off", "", "Reactor cold"]);
});

test("parses tags with their arguments", () => {
  const b = block("= main\n  GRETA BASE #title\n  ... #speed 40 #delay 800\n", "main");
  assert.deepEqual(b.children[0].tags, [{ name: "title", args: [] }]);
  assert.deepEqual(b.children[1].tags, [
    { name: "speed", args: ["40"] },
    { name: "delay", args: ["800"] },
  ]);
});

test("a tag-only line is a directive that prints nothing", () => {
  const b = block("= main\n  #clear\n", "main");
  assert.equal(b.children[0].kind, "directive");
  assert.deepEqual(b.children[0].tags, [{ name: "clear", args: [] }]);
});

test("tags on a block header attach to the block", () => {
  const b = block("= main #clear\n", "main");
  assert.deepEqual(b.tags, [{ name: "clear", args: [] }]);
});

test("splits text into literal and variable segments", () => {
  const b = block("= main\n  Reactor {core_temp} deg / {mode} mode\n", "main");
  const node = b.children[0] as TextNode;
  assert.deepEqual(node.segments, [
    { kind: "text", value: "Reactor " },
    { kind: "var", name: "core_temp" },
    { kind: "text", value: " deg / " },
    { kind: "var", name: "mode" },
    { kind: "text", value: " mode" },
  ]);
});

test("trims the edges of a line but keeps interior spacing", () => {
  const b = block("= main\n  a   b        #title\n", "main");
  assert.deepEqual(texts(b.children), ["a   b"]);
});

test("reads diverts, inline and standalone", () => {
  const b = block("= main\n  * Diagnostics -> diagnostics\n  -> main\n= diagnostics\n", "main");
  const choice = b.children[0] as ChoiceNode;
  assert.equal(choice.divert, "diagnostics");
  assert.deepEqual(b.children[1], {
    kind: "divert",
    target: "main",
    tags: [],
    line: 2,
    indent: 2,
  });
});

test("reads set statements", () => {
  const b = block("= main\n  set generator = on\n  set core_temp = 41.5\n", "main");
  assert.deepEqual(
    b.children.map((n) => (n.kind === "set" ? [n.name, n.value] : null)),
    [
      ["generator", "on"],
      ["core_temp", "41.5"],
    ]
  );
});

test("drops comments", () => {
  const b = block("= main\n  // a note\n  Real text\n", "main");
  assert.equal(b.children.length, 1);
});

test("reports unknown divert targets", () => {
  const story = parse("= main\n  * Go -> nowhere\n");
  assert.deepEqual(
    story.errors.map((e) => [e.line, e.message]),
    [[1, 'Unknown block "nowhere"']]
  );
});

test("back and end are valid divert targets", () => {
  assert.deepEqual(parse("= main\n  * Back -> back\n  -> end\n").errors, []);
});

test("reports duplicate block names", () => {
  const story = parse("= main\n= main\n");
  assert.equal(story.errors.length, 1);
  assert.match(story.errors[0].message, /Duplicate block name "main"/);
});

test("a bad line is reported on its own line and the rest still parses", () => {
  // `= 9lives` cannot be a header and is not allowed to silently become text.
  const story = parse("= main\n  Fine\n= 9lives\n  Also fine\n");
  assert.equal(story.errors.length, 1);
  assert.equal(story.errors[0].line, 2);
  assert.deepEqual(texts(story.byName.get("main")!.children), ["Fine", "Also fine"]);
});

test("handles CRLF input", () => {
  const story = parse("= main\r\n  Hello\r\n");
  assert.deepEqual(story.errors, []);
  assert.deepEqual(texts(story.byName.get("main")!.children), ["Hello"]);
});

test("reparsing repeatedly stays correct", () => {
  // The old parser held a module-scope iteration budget that ran out after a
  // hundred or so calls, which a live editor burns through in seconds.
  const source = "= main\n  * a\n    * b\n      * c\n        deep\n";
  const first = stringify(parse(source));
  for (let i = 0; i < 500; i++) parse(source);
  assert.equal(stringify(parse(source)), first);
});

test("over-indented lines are absorbed, not hung on", () => {
  const story = parse("= main\n  * a\n          way over\n");
  const choice = story.byName.get("main")!.children[0] as ChoiceNode;
  assert.deepEqual(texts(choice.children), ["way over"]);
});

test("round-trips through stringify", () => {
  const source = [
    "= main #clear",
    "  GRETA BASE #title",
    "  Generator: {generator}",
    "  * Diagnostics -> diagnostics",
    "  * Toggle generator",
    "    set generator = on",
    "    Generator online. #delay 800",
    "    -> main",
    "",
    "= diagnostics",
    "  Reactor nominal",
    "  * Back -> back",
  ].join("\n");
  // Reparsing our own output must give the same tree.
  assert.equal(stringify(parse(stringify(parse(source)))), stringify(parse(source)));
});

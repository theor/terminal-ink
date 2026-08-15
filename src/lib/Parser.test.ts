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

test("reads #set as a two-argument tag", () => {
  const b = block("= main\n  #set generator = on\n  #set core_temp = 41.5\n", "main");
  assert.deepEqual(
    b.children.map((n) => n.tags),
    [
      [{ name: "set", pair: true, args: ["generator", "on"] }],
      [{ name: "set", pair: true, args: ["core_temp", "41.5"] }],
    ]
  );
  assert.equal(b.children[0].kind, "directive", "a #set line prints nothing");
});

test("a #set value keeps its spaces and stops at the next tag", () => {
  const b = block("= main\n  #set candle = burning bright #delay 100\n", "main");
  assert.deepEqual(b.children[0].tags, [
    { name: "set", pair: true, args: ["candle", "burning bright"] },
    { name: "delay", args: ["100"] },
  ]);
});

test("the parser records which shape a tag was written in", () => {
  // The grammar knows the two shapes and no tag names at all; `pair` is what
  // lets tags.ts say whether the shape written was the right one.
  const b = block("= main\n  #set a = 1 #delay 100 #whatever x = 2\n", "main");
  assert.deepEqual(b.children[0].tags, [
    { name: "set", pair: true, args: ["a", "1"] },
    { name: "delay", args: ["100"] },
    { name: "whatever", pair: true, args: ["x", "2"] },
  ]);
});

test("#set rides on headers, text lines and choices", () => {
  const b = block(
    [
      "= main #set generator = off",
      "  Generator online #set generator = on",
      "  * Toggle #set generator = spinning up",
    ].join("\n"),
    "main"
  );
  assert.deepEqual(b.tags, [{ name: "set", pair: true, args: ["generator", "off"] }]);
  assert.deepEqual(b.children[0].tags, [
    { name: "set", pair: true, args: ["generator", "on"] },
  ]);
  assert.deepEqual(b.children[1].tags, [
    { name: "set", pair: true, args: ["generator", "spinning up"] },
  ]);
});

test("prose that looks like an assignment stays a printed line", () => {
  const b = block("= main\n  set generator = on\n", "main");
  assert.equal(b.children[0].kind, "text");
  assert.deepEqual(texts(b.children), ["set generator = on"]);
});

test("reports a #set that is not an assignment", () => {
  const story = parse("= main\n  #set\n");
  assert.equal(story.errors.length, 1);
  assert.match(story.errors[0].message, /#set is written as `#set name = value`/);
  assert.equal(story.errors[0].line, 1);
});

test("reports a malformed #set wherever it sits", () => {
  // The grammar accepts any tag in either shape, so the check has to cover
  // every position or an error would depend on where it was written.
  for (const source of [
    "= main #set\n",
    "= main\n  Text #set generator\n",
    "= main\n  * Pick #set generator on\n",
    "= main\n  #set\n",
    "= main\n  -> other #set\n= other\n  * ok\n",
  ]) {
    const story = parse(source);
    assert.equal(story.errors.length, 1, source);
    assert.match(story.errors[0].message, /#set is written as/, source);
  }
});

test("reports an ordinary tag written as an assignment", () => {
  // `#password a=b` used to parse as the single argument "a=b". It is a pair
  // now, so it has to be an error rather than a quietly different password.
  const story = parse("= main\n  ENTER PASSWORD #password a=b\n");
  assert.deepEqual(
    story.errors.map((e) => e.message),
    ["#password is written as `#password <word>`"]
  );
});

test("reports a tag given the wrong number of arguments", () => {
  const cases: [string, RegExp][] = [
    ["= main\n  #speed\n", /#speed is written as/],
    ["= main\n  #theme\n", /#theme is written as/],
    ["= main\n  Text #clear on\n", /#clear is written as/],
    ["= main\n  Text #delay 1 2\n", /#delay is written as/],
  ];
  for (const [source, message] of cases) {
    const story = parse(source);
    assert.equal(story.errors.length, 1, source);
    assert.match(story.errors[0].message, message, source);
  }
});

test("reports a tag written where it does nothing", () => {
  const story = parse("= main #title\n  * ok\n");
  assert.deepEqual(
    story.errors.map((e) => e.message),
    ["#title does nothing on a block header"]
  );
  assert.deepEqual(parse("= main\n  * Pick #title\n").errors.map((e) => e.message), [
    "#title does nothing on a choice",
  ]);
});

test("an unknown tag stays inert", () => {
  // Only a tag that means something can be written wrongly.
  assert.deepEqual(parse("= main\n  Text #whatever a b c\n  * ok\n").errors, []);
  assert.deepEqual(parse("= main #whatever x = y\n  * ok\n").errors, []);
});

test("unescapes text, and joins it back into one segment", () => {
  const b = block("= main\n  abc\\#def\n", "main");
  const node = b.children[0] as TextNode;
  assert.deepEqual(node.segments, [{ kind: "text", value: "abc#def" }]);
});

test("escapes every reserved character", () => {
  const b = block("= main\n  \\# \\{ \\} \\= \\* \\- \\/\n", "main");
  assert.deepEqual(texts(b.children), ["# { } = * - /"]);
});

test("an escaped sigil at the start of a line prints instead of parsing", () => {
  const b = block(
    ["= main", "  \\= main", "  \\* Diagnostics", "  \\// note", "  \\-> main"].join("\n"),
    "main"
  );
  assert.deepEqual(texts(b.children), ["= main", "* Diagnostics", "// note", "-> main"]);
});

test("an escaped arrow in a choice label does not divert", () => {
  const b = block("= main\n  * Type \\-> to continue\n", "main");
  const choice = b.children[0] as ChoiceNode;
  assert.equal(segmentsToString(choice.label), "Type -> to continue");
  assert.equal(choice.divert, undefined);
});

test("escapes and interpolation coexist", () => {
  const b = block("= main\n  \\{{mode}\\} costs \\#5\n", "main");
  const node = b.children[0] as TextNode;
  assert.deepEqual(node.segments, [
    { kind: "text", value: "{" },
    { kind: "var", name: "mode" },
    { kind: "text", value: "} costs #5" },
  ]);
});

test("a lone backslash survives untouched", () => {
  const b = block("= main\n  C:\\Users\\theor\n  \\\\SERVER\\share\n", "main");
  assert.deepEqual(texts(b.children), ["C:\\Users\\theor", "\\\\SERVER\\share"]);
});

test("a #set value can hold an escaped hash", () => {
  const b = block("= main\n  #set colour = \\#ff0000\n", "main");
  assert.deepEqual(b.children[0].tags, [
    { name: "set", pair: true, args: ["colour", "#ff0000"] },
  ]);
});

test("escapes do not reach a tag's arguments", () => {
  // A known boundary, pinned so it is not mistaken for a bug: arguments split
  // on whitespace and stop at `#`, so a `#` cannot be escaped into one. The
  // `#set` value is the exception, because it runs to the next tag.
  const b = block("= main\n  ENTER PASSWORD #password se\\#ret\n", "main");
  assert.deepEqual(b.children[0].tags, [
    { name: "password", args: ["se\\"] },
    { name: "ret", args: [] },
  ]);
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
    "= main #clear #set generator = off",
    "  GRETA BASE #title",
    "  Generator: {generator}",
    "  Type \\-> or \\# or \\{ to go on",
    "  \\* not a choice",
    "  C:\\Users\\theor",
    "  * Diagnostics -> diagnostics",
    "  * Toggle generator #set generator = spinning up",
    "    Generator online. #delay 800",
    "    -> main",
    "",
    "= diagnostics",
    "  Reactor nominal",
    "  * Back -> back",
  ].join("\n");
  const once = stringify(parse(source));
  // Reparsing our own output must give the same tree -- so escapes have to be
  // put back on the way out, and a #set has to keep its `=`.
  assert.deepEqual(parse(once).errors, []);
  assert.equal(stringify(parse(once)), once);
  assert.deepEqual(
    texts(parse(once).byName.get("main")!.children),
    [
      "GRETA BASE",
      "Generator: {generator}",
      "Type -> or # or { to go on",
      "* not a choice",
      "C:\\Users\\theor",
    ],
    "the text survives the trip unchanged"
  );
});

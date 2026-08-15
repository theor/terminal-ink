import { test } from "node:test";
import assert from "node:assert/strict";
import grammar from "./grammar.ohm-bundle.js";
import { parse } from "./Parser.ts";

function accepts(line: string): boolean {
  return grammar.match(line, "line").succeeded();
}

/** The rule that matched, so we can assert a line was classified correctly. */
function ruleOf(line: string): string {
  const m = grammar.match(line, "line");
  assert.ok(m.succeeded(), `expected ${JSON.stringify(line)} to parse`);
  return (m as any)._cst.children[0].ctorName;
}

/** The arguments a single tag was split into. */
function argsOf(line: string): string[] {
  const story = parse(line);
  assert.deepEqual(story.errors, [], line);
  return story.blocks[0].children[0].tags[0].args;
}

test("accepts prose with arbitrary punctuation", () => {
  // Every one of these is a real line from the Mothership boot sequence that
  // the previous grammar rejected.
  const lines = [
    "TRAC PC-9800 Series System Terminal",
    "Copyright (C) 2981, 2987 Reythorne Corp. /",
    "EEEE I3000000032940xf100110303B77500EEEE",
    ".........................",
    "no sdio debug board detected ",
    "BT : 11:30:18 Mar 14 2314",
    "Generator [off]",
    "ucl decompress...pass",
    "0x12345678",
  ];
  for (const line of lines) assert.ok(accepts(line), line);
});

test("classifies each kind of line", () => {
  assert.equal(ruleOf("= boot"), "blockLine");
  assert.equal(ruleOf("  * Diagnostics"), "choiceLine");
  assert.equal(ruleOf("  -> main"), "divertLine");
  assert.equal(ruleOf("  #set generator = \"on\""), "tagLine");
  assert.equal(ruleOf("  Reactor nominal"), "textLine");
  assert.equal(ruleOf("  #clear"), "tagLine");
  assert.equal(ruleOf("  // note to self"), "commentLine");
  assert.equal(ruleOf(""), "blankLine");
  assert.equal(ruleOf("    "), "blankLine");
});

test("prose that looks like an assignment is printed, not executed", () => {
  // The whole reason assignment moved behind `#`: none of these may quietly
  // turn into state changes and vanish from the screen.
  assert.equal(ruleOf("set generator = on"), "textLine");
  assert.equal(ruleOf("set course = home"), "textLine");
  assert.equal(ruleOf("settings offline"), "textLine");
  assert.equal(ruleOf("set course for home"), "textLine");
  assert.equal(ruleOf("set = on"), "textLine");
  assert.equal(ruleOf("Reactor = nominal"), "textLine");
});

test("accepts #set in every position a tag may sit", () => {
  assert.ok(accepts("#set generator = \"on\""), "on its own line");
  assert.ok(accepts("= main #set generator = \"on\""), "on a block header");
  assert.ok(accepts("Generator online #set generator = \"on\""), "on a text line");
  assert.ok(accepts("* Toggle #set generator = \"on\""), "on a choice");
  assert.ok(accepts("* Toggle -> main #set generator = \"on\""), "after an inline divert");
  assert.ok(accepts("-> main #set generator = \"on\""), "on a divert");
});

test("a #set value may hold spaces, and stops at the next tag", () => {
  assert.ok(accepts("#set candle = \"burning bright\""));
  assert.ok(accepts("#set candle = \"burning bright\" #delay 100"));
});

test("an argument does not swallow an inline divert", () => {
  // The arrow comes first on a choice. Written the other way round the value
  // would quietly become "low -> purge" and never match anything, so the line
  // has to fail instead.
  assert.ok(!accepts("* Purge #if coolant = \"low -> purge\""), "divert after the tag");
  assert.ok(accepts("* Purge -> purge #if coolant = \"low\""), "divert before it");
});

test("the grammar knows no tag names, and no per-tag structure", () => {
  // Whether a name is real, and how its arguments should read, is tags.ts's
  // job -- so all of these parse here and are reported by the parser instead.
  assert.ok(accepts("#set generator"), "a malformed #set still parses");
  assert.ok(accepts("#whatever a = b"), "an unknown name takes arguments too");
  assert.ok(accepts("#settings"), "a name merely starting with set");
  assert.ok(accepts("#setup 3"));
});

test("every tag is read the same way: a name and its arguments", () => {
  assert.deepEqual(argsOf("#set generator = \"on\""), ["generator", "=", '"on"']);
  assert.deepEqual(argsOf("#password sable"), ["sable"]);
  assert.deepEqual(argsOf("#speed 40"), ["40"]);
  assert.deepEqual(argsOf("#delay 8=00"), ["8=00"], "an = is not special");
  assert.deepEqual(argsOf("#clear"), []);
});

test("a rule of equals signs is text, not a block header", () => {
  assert.equal(ruleOf("=== SYSTEM ==="), "textLine");
  assert.equal(ruleOf("=========="), "textLine");
});

test("accepts tags with and without arguments", () => {
  assert.ok(accepts("GRETA BASE #title"));
  assert.ok(accepts("ENTER PASSWORD #password 123"));
  assert.ok(accepts("...... #speed 40 #delay 800"));
  assert.ok(accepts("#delay"));
});

test("accepts interpolation", () => {
  assert.ok(accepts("Generator: {generator}"));
  assert.ok(accepts("Reactor {core_temp} deg / {mode} mode"));
  assert.ok(accepts("{a}{b}"));
});

test("accepts diverts, spaced or not", () => {
  assert.ok(accepts("-> main"));
  assert.ok(accepts("->main"));
  assert.ok(accepts("* Diagnostics -> diagnostics"));
  assert.ok(accepts("*Comms->comms"));
  assert.ok(accepts("* Back -> back"));
});

test("rejects malformed lines", () => {
  assert.ok(!accepts("= "), "block header without a name");
  assert.ok(!accepts("= 9lives"), "block name must not start with a digit");
  assert.ok(!accepts("->"), "divert without a target");
  assert.ok(!accepts("Reactor {core temp}"), "interpolation must be one ident");
});

// --- escapes ---------------------------------------------------------------

test("a backslash escapes every character the parser reserves", () => {
  for (const ch of "#{}=*-/") {
    assert.ok(accepts(`literal \\${ch} here`), `\\${ch} mid-line`);
  }
});

test("an escaped sigil at the start of a line is text, not a line form", () => {
  assert.equal(ruleOf("\\= main"), "textLine");
  assert.equal(ruleOf("\\* Diagnostics"), "textLine");
  assert.equal(ruleOf("\\// not a comment"), "textLine");
  assert.equal(ruleOf("\\-> not a divert"), "textLine");
  assert.equal(ruleOf("\\#clear"), "textLine");
});

test("an escape does not break the text around it", () => {
  assert.ok(accepts("abc\\#def"));
  assert.ok(accepts("cost \\{5\\} credits"));
  assert.ok(accepts("{mode} \\-> \\{raw\\}"), "escapes and interpolation mix");
});

test("a lone backslash is just a backslash", () => {
  // Terminals print paths and ASCII art; requiring `\\` everywhere would be a
  // tax on every line of them.
  assert.ok(accepts("C:\\Users\\theor"));
  assert.ok(accepts("\\\\SERVER\\share"));
  assert.equal(ruleOf("C:\\Users"), "textLine");
});

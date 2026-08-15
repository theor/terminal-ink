import { test } from "node:test";
import assert from "node:assert/strict";
import grammar from "./grammar.ohm-bundle.js";

function accepts(line: string): boolean {
  return grammar.match(line, "line").succeeded();
}

/** The rule that matched, so we can assert a line was classified correctly. */
function ruleOf(line: string): string {
  const m = grammar.match(line, "line");
  assert.ok(m.succeeded(), `expected ${JSON.stringify(line)} to parse`);
  return (m as any)._cst.children[0].ctorName;
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
  assert.equal(ruleOf("  set generator = on"), "setLine");
  assert.equal(ruleOf("  Reactor nominal"), "textLine");
  assert.equal(ruleOf("  #clear"), "tagLine");
  assert.equal(ruleOf("  // note to self"), "commentLine");
  assert.equal(ruleOf(""), "blankLine");
  assert.equal(ruleOf("    "), "blankLine");
});

test("does not mistake prose starting with a keyword for a directive", () => {
  assert.equal(ruleOf("settings offline"), "textLine");
  assert.equal(ruleOf("set course for home"), "textLine");
  assert.equal(ruleOf("set = on"), "textLine", "incomplete set falls back to text");
  assert.equal(ruleOf("Reactor = nominal"), "textLine");
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

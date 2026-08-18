import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "./Parser.ts";
import { Runner, type Output, type StepResult } from "./Runner.ts";
import { num, str } from "./expr.ts";

function runner(source: string) {
  const story = parse(source);
  assert.deepEqual(story.errors, [], "fixture should parse cleanly");
  return new Runner(story);
}

/** Just the printed lines, dropping directive-only outputs. */
function lines(step: StepResult | Output[]): string[] {
  const outputs = Array.isArray(step) ? step : step.outputs;
  return outputs.filter((o) => o.text !== null).map((o) => o.text!);
}

function labels(step: StepResult): string[] {
  return step.choices.map((c) => c.label);
}

test("runs a block and offers its choices", () => {
  const r = runner("= main\nHello\n* One\n* Two\n");
  const step = r.start();
  assert.deepEqual(lines(step), ["Hello"]);
  assert.deepEqual(labels(step), ["One", "Two"]);
  assert.equal(step.halted, false);
});

test("starts at the block it was built for, not the first one", () => {
  const source = "= boot\nBOOTING\n-> main\n\n= main\nGRETA BASE\n* One\n";
  const story = parse(source);
  assert.deepEqual(lines(new Runner(story).start()), ["BOOTING", "GRETA BASE"]);
  assert.deepEqual(lines(new Runner(story, "main").start()), ["GRETA BASE"]);
});

test("substitutes variables, and leaves unset ones visible", () => {
  const r = runner("= main\n#set mode = \"SAFE\"\nMode: {mode} / {missing}\n* ok\n");
  assert.deepEqual(lines(r.start()), ["Mode: SAFE / {missing}"]);
});

// --- #set -----------------------------------------------------------------

test("#set assigns from every position a tag may sit", () => {
  const r = runner(
    [
      "= main #set a = \"header\"",
      "#set b = \"own line\"",
      "Printed #set c = \"text line\"",
      "* Pick #set d = \"choice\"",
    ].join("\n")
  );
  const step = r.start();
  assert.deepEqual(lines(step), ["Printed"], "a #set line prints nothing of its own");
  assert.deepEqual(
    ["a", "b", "c"].map((k) => r.vars.get(k)),
    [str("header"), str("own line"), str("text line")]
  );
  assert.equal(r.vars.get("d"), undefined, "a choice's #set waits until it is picked");

  r.select(0);
  assert.deepEqual(r.vars.get("d"), str("choice"));
});

test("a value may hold spaces", () => {
  const r = runner("= main\n#set candle = \"burning bright\"\n{candle}\n* ok\n");
  assert.deepEqual(lines(r.start()), ["burning bright"]);
});

test("a #set runs before the line it sits on is printed", () => {
  // Same order as #clear, so a line can assert a new state and display it.
  const r = runner("= main\nGenerator: {generator} #set generator = \"on\"\n* ok\n");
  assert.deepEqual(lines(r.start()), ["Generator: on"]);
});

test("a #set on a choice runs before the choice's body", () => {
  const r = runner(
    ["= main", "* Toggle #set generator = \"on\"", "  Generator: {generator}"].join("\n")
  );
  r.start();
  assert.ok(lines(r.select(0)).includes("Generator: on"));
});

test("a #set on a block header re-runs on every redraw", () => {
  // Pinned deliberately, as the old block-level `set` was: a header
  // assignment re-initialises the block every time it is drawn, so it belongs
  // on a block you divert away from, not on a menu you come back to.
  const r = runner(
    ["= main #set generator = \"off\"", "Generator: {generator}", "* Toggle #set generator = \"on\""].join("\n")
  );
  r.start();
  assert.deepEqual(lines(r.select(0)), ["Generator: off"]);
});

test("a #set outside the redrawn screen keeps its value", () => {
  const r = runner(
    ["= boot #set generator = \"off\"", "-> main", "= main", "Generator: {generator}", "* Toggle #set generator = \"on\""].join("\n")
  );
  r.start();
  assert.deepEqual(lines(r.select(0)), ["Generator: on"], "main has no #set to undo it");
});

test("a tag on a divert line fires before the jump", () => {
  const r = runner(
    ["= main", "-> other #set flag = 1", "= other", "Flag: {flag}", "* ok"].join("\n")
  );
  const step = r.start();
  assert.deepEqual(lines(step), ["Flag: 1"]);
});

// --- #if ------------------------------------------------------------------

test("#if keeps a line off the screen until it matches", () => {
  const source = [
    "= main",
    "Reactor nominal",
    "ALARM: COOLANT LOW #if coolant = \"low\"",
    "* Vent coolant #set coolant = \"low\"",
  ].join("\n");
  const r = runner(source);
  assert.deepEqual(lines(r.start()), ["Reactor nominal"]);
  assert.deepEqual(lines(r.select(0)), ["Reactor nominal", "ALARM: COOLANT LOW"]);
});

test("#if hides a choice rather than blanking it", () => {
  const r = runner(
    ["= main", "* Vent #set coolant = \"low\"", "* Purge #if coolant = \"low\""].join("\n")
  );
  assert.deepEqual(labels(r.start()), ["Vent"]);
  assert.deepEqual(labels(r.select(0)), ["Vent", "Purge"]);
});

test("a hidden choice does not renumber the ones around it", () => {
  // `select` looks the node back up by its position among all the choices, so
  // dropping one from the middle must not shift what the others select.
  const r = runner(
    [
      "= main",
      "* First -> first",
      "* Hidden -> hidden #if never = \"yes\"",
      "* Third -> third",
      "= first",
      "One",
      "* ok",
      "= hidden",
      "Two",
      "* ok",
      "= third",
      "Three",
      "* ok",
    ].join("\n")
  );
  assert.deepEqual(labels(r.start()), ["First", "Third"]);
  assert.deepEqual(lines(r.select(1)), ["Three"], "the second offered choice is the third");
});

test("#if suppresses everything else written on its line", () => {
  const r = runner(
    ["= main", "Locked #set opened = \"yes\" #if key = \"found\"", "{opened}", "* ok"].join("\n")
  );
  assert.deepEqual(lines(r.start()), ["{opened}"], "the #set went with the line");
});

test("#if on a divert chooses whether the story goes there", () => {
  const source = [
    "= main",
    "#set coolant = \"low\"",
    "-> purge #if coolant = \"low\"",
    "Nothing happens",
    "* ok",
    "= purge",
    "PURGING",
    "* ok",
  ].join("\n");
  assert.deepEqual(lines(runner(source).start()), ["PURGING"]);

  const cold = runner(source.replace("#set coolant = \"low\"", "#set coolant = \"fine\""));
  assert.deepEqual(lines(cold.start()), ["Nothing happens"]);
});

test("#if on a bare directive line conditions the directive", () => {
  const r = runner(["= main", "Kept", "#clear #if wipe = \"yes\"", "* ok"].join("\n"));
  assert.ok(
    !r.start().outputs.some((o) => o.tags.some((t) => t.name === "clear")),
    "the #clear is skipped along with the line"
  );
});

test("an unset variable matches nothing", () => {
  // Not even the word "unset" -- there is no value there to compare against.
  const r = runner(
    ["= main", "Hidden #if flag = \"unset\"", "Also hidden #if flag = \"ready\"", "Shown", "* ok"].join("\n")
  );
  assert.deepEqual(lines(r.start()), ["Shown"]);
});

test("a screen whose every choice is hidden halts", () => {
  const r = runner(["= main", "Done", "* Never #if a = \"b\""].join("\n"));
  const step = r.start();
  assert.deepEqual(labels(step), []);
  assert.equal(step.halted, true);
});

test("escaped sigils reach the screen as written", () => {
  const r = runner(
    ["= main", "Type \\-> to continue", "\\* not a choice", "C:\\Users\\theor", "* ok"].join("\n")
  );
  const step = r.start();
  assert.deepEqual(lines(step), ["Type -> to continue", "* not a choice", "C:\\Users\\theor"]);
  assert.deepEqual(labels(step), ["ok"], "only the real choice is offered");
});

test("prose that looks like an assignment is printed", () => {
  const r = runner("= main\nset generator = on\n* ok\n");
  assert.deepEqual(lines(r.start()), ["set generator = on"]);
  assert.equal(r.vars.get("generator"), undefined);
});

test("carries tags through to the output", () => {
  const r = runner("= main #clear\nGRETA BASE #title\n#delay 800\n* ok\n");
  const outputs = r.start().outputs;
  assert.deepEqual(outputs, [
    { text: null, tags: [{ name: "clear", args: [] }] },
    { text: "GRETA BASE", tags: [{ name: "title", args: [] }] },
    { text: null, tags: [{ name: "delay", args: ["800"] }] },
  ]);
});

test("a divert moves to another block", () => {
  const r = runner("= main\n-> other\n= other\nThere\n* ok\n");
  const step = r.start();
  assert.deepEqual(lines(step), ["There"]);
  assert.equal(r.currentBlock?.name, "other");
});

test("-> end halts", () => {
  const r = runner("= main\nBye\n-> end\n");
  const step = r.start();
  assert.equal(step.halted, true);
  assert.deepEqual(step.choices, []);
});

test("a block with no choices and no divert halts", () => {
  assert.equal(runner("= main\nDone\n").start().halted, true);
});

test("a divert cycle is cut off instead of hanging", () => {
  const r = runner("= a\n-> b\n= b\n-> a\n");
  const step = r.start();
  assert.equal(step.halted, true);
  assert.match(lines(step).at(-1)!, /loops forever/);
});

// --- choices --------------------------------------------------------------

test("a plain choice redraws the screen without growing the stack", () => {
  const r = runner(
    ["= main #clear", "Generator: {generator}", "* Toggle", "  #set generator = \"on\""].join("\n")
  );
  r.start();
  const depth = r.depth;
  for (let i = 0; i < 40; i++) {
    const step = r.select(0);
    assert.deepEqual(lines(step), ["Generator: on"]);
    assert.deepEqual(labels(step), ["Toggle"]);
  }
  assert.equal(r.depth, depth, "redraw must not push a screen");
});

test("a set at block level re-runs on every redraw", () => {
  // Pinned deliberately: a `#set` runs whenever it is executed, so
  // initialisation belongs in a block you divert away from, not in the menu
  // you return to.
  const r = runner(
    ["= main", "#set generator = \"off\"", "Generator: {generator}", "* Toggle", "  #set generator = \"on\""].join("\n")
  );
  r.start();
  assert.deepEqual(lines(r.select(0)), ["Generator: off"]);
});

test("nested choices become a sub-menu, and back returns from it", () => {
  const r = runner(
    ["= main", "* Systems", "  Pick one", "  * Reactor", "    Reactor cold", "  * Back -> back", "* Quit -> end"].join("\n")
  );
  r.start();
  const depth = r.depth;

  const sub = r.select(0);
  assert.deepEqual(lines(sub), ["Pick one"]);
  assert.deepEqual(labels(sub), ["Reactor", "Back"]);
  assert.equal(r.depth, depth + 1);

  const back = r.select(1);
  assert.equal(r.depth, depth);
  assert.deepEqual(labels(back), ["Systems", "Quit"]);
});

test("-> back at the outermost screen redraws instead of underflowing", () => {
  const r = runner("= main\nHome\n* Back -> back\n");
  r.start();
  const step = r.select(0);
  assert.equal(r.depth, 1);
  assert.deepEqual(lines(step), ["Home"]);
});

test("an inline divert on a choice runs its body first", () => {
  const r = runner(
    ["= main", "* Go -> other", "  #set flag = 1", "  Leaving", "= other", "Arrived", "* ok"].join("\n")
  );
  r.start();
  const step = r.select(0);
  assert.deepEqual(lines(step), ["Leaving", "Arrived"]);
  assert.deepEqual(r.vars.get("flag"), num(1), "an unquoted 1 is the number 1");
});

// --- gates ----------------------------------------------------------------

test("a password gate stops execution until it is answered", () => {
  const r = runner(
    ["= start", "ENTER PASSWORD #password 123", "-> main", "= main", "GRETA BASE", "* Diagnostics"].join("\n")
  );

  const step = r.start();
  assert.equal(step.pause?.tag.name, "password");
  assert.deepEqual(step.pause?.tag.args, ["123"]);
  assert.deepEqual(step.choices, [], "no choices while gated");
  // The important part: nothing past the gate has run yet.
  assert.deepEqual(lines(step), ["ENTER PASSWORD"]);
  assert.equal(r.currentBlock?.name, "start");

  const wrong = r.resume(false);
  assert.equal(wrong.pause?.tag.name, "password");
  assert.deepEqual(lines(wrong), [], "a wrong answer emits nothing new");
  assert.equal(r.currentBlock?.name, "start");

  const right = r.resume(true);
  assert.equal(right.pause, undefined);
  assert.deepEqual(lines(right), ["GRETA BASE"]);
  assert.deepEqual(labels(right), ["Diagnostics"]);
});

// --- history & replay -------------------------------------------------------

test("history records the menu position and label of each choice taken", () => {
  const r = runner("= main\n* One -> a\n* Two -> b\n= a\nA\n* ok\n= b\nB\n* x\n* ok\n");
  r.start();
  r.select(1); // Two
  r.select(1); // ok, the second choice on b's screen
  assert.deepEqual(r.history, [
    { kind: "choice", index: 1, label: "Two" },
    { kind: "choice", index: 1, label: "ok" },
  ]);
});

test("a choice's recorded label is interpolated, not the raw source", () => {
  const r = runner("= main\n#set name = \"Ripley\"\n* Hello {name}\n");
  r.start();
  r.select(0);
  assert.deepEqual(r.history, [{ kind: "choice", index: 0, label: "Hello Ripley" }]);
});

test("a hidden choice does not shift the recorded index", () => {
  // `select`'s argument is a menu position, so history has to hold that
  // position -- not the node's position among every choice on the screen,
  // which is what a `#if` can leave gaps in.
  const r = runner(
    ["= main", "* First -> a", "* Hidden #if never = \"yes\"", "* Third -> b", "= a", "A", "* ok", "= b", "B", "* ok"].join("\n")
  );
  r.start();
  r.select(1); // the second *offered* choice, which is "Third"
  assert.deepEqual(r.history, [{ kind: "choice", index: 1, label: "Third" }]);
  assert.equal(r.currentBlock?.name, "b");
});

test("history records a correct gate answer, not a wrong one", () => {
  const r = runner(
    ["= start", "PW #password 123", "-> main", "= main", "Home", "* ok"].join("\n")
  );
  r.start();
  r.resume(false);
  r.resume(false);
  r.resume(true);
  assert.deepEqual(r.history, [{ kind: "resume" }]);
});

test("start() clears history", () => {
  const r = runner("= main\n* One\n* Two\n");
  r.start();
  r.select(0);
  r.start();
  assert.deepEqual(r.history, []);
});

test("replay([]) is exactly start()", () => {
  const source = "= main\nHello\n* One\n* Two\n";
  const started = runner(source).start();
  const replayed = runner(source).replay([]);
  assert.deepEqual(replayed, started);
});

test("replay reconstructs state, position and the whole path's output", () => {
  const source = [
    "= main #set generator = \"off\"",
    "Generator: {generator}",
    "* Toggle -> next",
    "  #set generator = \"on\"",
    "= next",
    "Next: {generator}",
    "* Continue -> systems",
    "= systems",
    "Systems menu",
    "* ok",
  ].join("\n");
  const live = runner(source);
  live.start();
  live.select(0); // Toggle -> next, generator on
  live.select(0); // Continue -> systems

  const fresh = runner(source);
  const step = fresh.replay(live.history);
  assert.equal(fresh.currentBlock?.name, "systems");
  assert.deepEqual(fresh.vars.get("generator"), str("on"));
  assert.deepEqual(
    lines(step),
    ["Generator: off", "Next: on", "Systems menu"],
    "every step replayed contributes to the one result, not just the last"
  );
});

test("replay answers gates unconditionally, catching the player back up", () => {
  const live = runner(storySource);
  live.start();
  live.resume(true);
  live.select(0); // Diagnostics

  const fresh = runner(storySource);
  const step = fresh.replay(live.history);
  assert.equal(step.pause, undefined, "the gate is passed without being asked again");
  assert.equal(fresh.currentBlock?.name, "diagnostics");
  assert.deepEqual(labels(step), ["Toggle generator", "Back"]);
});

test("replay stops at a choice an edit removed, rather than guessing", () => {
  const before = "= main\n* One -> a\n* Two -> b\n= a\nA\n* ok\n= b\nB\n* ok\n";
  const live = runner(before);
  live.start();
  live.select(1); // Two

  // The edit dropped the second choice.
  const after = "= main\n* One -> a\n= a\nA\n* ok\n";
  const fresh = runner(after);
  const step = fresh.replay(live.history);
  assert.equal(fresh.currentBlock?.name, "main", "replay stopped before the missing choice");
  assert.deepEqual(labels(step), ["One"]);
});

// --- the real story -------------------------------------------------------

const storySource = readFileSync(
  fileURLToPath(new URL("../assets/story.lore", import.meta.url)),
  "utf8"
);

test("story.lore parses with no errors", () => {
  assert.deepEqual(parse(storySource).errors, []);
  // Every name it reads is declared somewhere, so a preview started anywhere
  // in it has real values to print.
  assert.deepEqual(parse(storySource).warnings, []);
});

test("a full path through story.lore", () => {
  const r = runner(storySource);

  // boot -> start, stopping at the password rather than running on into main.
  const boot = r.start();
  assert.equal(boot.pause?.tag.name, "password");
  assert.ok(lines(boot).includes("TRAC PC-9800 Series System Terminal"));
  assert.ok(lines(boot).includes("ENTER PASSWORD"));
  assert.ok(!lines(boot).includes("GRETA BASE"), "main must not have run yet");
  assert.ok(
    boot.outputs.some((o) => o.tags.some((t) => t.name === "clear")),
    "the boot sequence clears the screen partway through"
  );

  const menu = r.resume(true);
  assert.deepEqual(labels(menu), ["Diagnostics", "Controls", "Comms", "Reboot"]);
  assert.ok(lines(menu).includes("Generator: off"));

  const diagnostics = r.select(0);
  assert.equal(r.currentBlock?.name, "diagnostics");
  assert.deepEqual(labels(diagnostics), ["Toggle generator", "Back"]);
  assert.ok(lines(diagnostics).includes("Generator [off]"));
  assert.ok(lines(diagnostics).includes("WARNING: MAIN BUS UNDERVOLT"), "#if matches");

  assert.ok(lines(diagnostics).includes("Core load [34%]"), "a number prints without quotes");
  assert.ok(!lines(diagnostics).includes("CAUTION: CORE LOAD HIGH"), "34 is not over 80");

  const toggled = r.select(0);
  assert.equal(r.currentBlock?.name, "diagnostics", "toggling stays put");
  assert.ok(lines(toggled).includes("Generator spinning up..."));
  assert.ok(lines(toggled).includes("Generator [on]"), "the screen redraws with the new state");
  assert.ok(
    !lines(toggled).includes("WARNING: MAIN BUS UNDERVOLT"),
    "and the warning goes with it"
  );
  assert.ok(lines(toggled).includes("Core load [89%]"), "34 + 55, done as arithmetic");
  assert.ok(lines(toggled).includes("CAUTION: CORE LOAD HIGH"), "89 is over 80");
  assert.deepEqual(labels(toggled), ["Back"], "the spent choice hides itself");

  const back = r.select(0);
  assert.equal(r.currentBlock?.name, "main");
  assert.ok(lines(back).includes("Generator: on"), "state survives the trip back");
  assert.deepEqual(labels(back), ["Diagnostics", "Controls", "Comms", "Reboot"]);

  // A reboot means a reboot: `boot` resets what the prelude declared, so the
  // spent toggle is offered again. The prelude alone would not do this -- it
  // runs on `start`, and rebooting is a divert.
  r.select(3);
  r.resume(true);
  const rebooted = r.select(0);
  assert.ok(lines(rebooted).includes("Generator [off]"));
  assert.ok(lines(rebooted).includes("Core load [34%]"));
  assert.deepEqual(labels(rebooted), ["Toggle generator", "Back"]);
});

const grimoireSource = readFileSync(
  fileURLToPath(new URL("../assets/grimoire.lore", import.meta.url)),
  "utf8"
);

test("grimoire.lore parses, and its multi-word value survives", () => {
  assert.deepEqual(parse(grimoireSource).warnings, []);
  const r = runner(grimoireSource);
  r.start();
  const shelf = r.resume(true); // past the ward
  assert.ok(
    lines(shelf).includes("The candle is lit. Three volumes lie open before you."),
    "the prelude ran, before a word of the book was printed"
  );

  const candle = r.select(2); // Attend to the candle
  assert.deepEqual(labels(candle), ["Pinch it out", "Trim the wick", "Leave it"]);

  const trimmed = r.select(1); // Trim the wick -- a value with a space in it
  assert.deepEqual(r.vars.get("candle"), str("burning bright"));
  assert.ok(lines(trimmed).includes("The flame steadies."));

  assert.ok(
    lines(r.select(2)).includes(
      "The candle is burning bright. Three volumes lie open before you."
    ),
    "leaving the sub-menu redraws the shelf with the new value"
  );
});

test("rebooting from the menu re-runs the boot sequence", () => {
  const r = runner(storySource);
  r.start();
  r.resume(true);
  const reboot = r.select(3);
  assert.equal(reboot.pause?.tag.name, "password", "reboot gates on the password again");
  assert.ok(lines(reboot).includes("TRAC PC-9800 Series System Terminal"));
});

// --- #prelude -------------------------------------------------------------

/** A story whose defaults live outside the flow that would set them. */
const withPrelude = [
  '= defaults #prelude',
  '  #set generator = "off"',
  "  #set load = 34",
  "",
  "= boot",
  "  BOOTING",
  "  -> main",
  "",
  "= main",
  "  Generator: {generator} at {load}",
  "  * ok",
].join("\n");

test("a prelude is applied wherever the story starts", () => {
  assert.deepEqual(lines(runner(withPrelude).start()), [
    "BOOTING",
    "Generator: off at 34",
  ]);
  // The case this exists for: a preview restarted at a block halfway down the
  // document, with none of the blocks above it having run.
  const story = parse(withPrelude);
  assert.deepEqual(lines(new Runner(story, "main").start()), [
    "Generator: off at 34",
  ]);
});

test("a prelude prints nothing and is not entered", () => {
  const r = runner(withPrelude);
  const step = r.start();
  assert.equal(r.currentBlock?.name, "main", "the story opens past the prelude");
  assert.equal(r.depth, 2, "boot and main; the prelude is not on the stack");
  assert.deepEqual(
    step.outputs.filter((o) => o.tags.some((t) => t.name === "prelude")),
    [],
    "nothing the prelude holds reaches the screen"
  );
});

test("starting at a prelude runs the story instead", () => {
  // The editor names the block the cursor is in, and the cursor may be sitting
  // in the declarations.
  const story = parse(withPrelude);
  const r = new Runner(story, "defaults");
  assert.deepEqual(lines(r.start()), ["BOOTING", "Generator: off at 34"]);
});

test("a prelude is re-applied on every start, and the story may overwrite it", () => {
  const r = runner(withPrelude + '\n  * Turn on #set generator = "on"\n');
  r.start();
  r.select(1);
  assert.deepEqual(r.vars.get("generator"), str("on"));
  r.start();
  assert.deepEqual(r.vars.get("generator"), str("off"), "a restart declares again");
});

test("several preludes are applied in source order", () => {
  const r = runner(
    [
      "= a #prelude",
      "  #set x = 1",
      "",
      "= b #prelude",
      "  #set x = 2",
      "",
      "= main",
      "  {x}",
      "  * ok",
    ].join("\n")
  );
  assert.deepEqual(lines(r.start()), ["2"]);
});

test("a story that is nothing but a prelude has no screen to open", () => {
  const r = runner("= defaults #prelude\n  #set x = 1\n");
  const step = r.start();
  assert.deepEqual(lines(step), []);
  assert.equal(step.halted, true);
});

test("a prelude carries the look as well as the state", () => {
  // The reason a setting belongs in one: `#theme` on `wake` is lost by a
  // preview that starts at `shelf`, and the book is drawn as a terminal.
  const story = parse(
    [
      "= defaults #prelude #theme library",
      "  #speed 18",
      '  #set candle = "lit"',
      "",
      "= wake",
      "  -> shelf",
      "",
      "= shelf",
      "  The candle is {candle}.",
      "  * ok",
    ].join("\n")
  );
  const step = new Runner(story, "shelf").start();
  const declared = step.outputs.flatMap((o) => o.tags).map((t) => t.name);
  assert.deepEqual(
    declared,
    ["theme", "speed", "set"],
    "the settings reach the terminal, and #prelude itself never does"
  );
  assert.deepEqual(lines(step), ["The candle is lit."]);
  assert.deepEqual(
    step.outputs.filter((o) => o.text !== null).length,
    1,
    "the settings ride outputs that print nothing"
  );
});

test("#if in a prelude decides whether a declaration is made", () => {
  // Preludes run top to bottom, so a line can condition on one above it.
  // Everything else is unset at this point, which is the whole scope of it.
  const source = (mode: string) =>
    [
      "= defaults #prelude",
      `  #set mode = "${mode}"`,
      '  #set hull = "breached" #if mode = "wreck"',
      "",
      "= main",
      "  Hull: {hull}",
      "  * ok",
    ].join("\n");
  assert.deepEqual(lines(runner(source("wreck")).start()), ["Hull: breached"]);
  assert.deepEqual(lines(runner(source("calm")).start()), ["Hull: {hull}"]);
});

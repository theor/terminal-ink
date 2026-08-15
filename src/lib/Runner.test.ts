import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "./Parser.ts";
import { Runner, type Output, type StepResult } from "./Runner.ts";

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

test("substitutes variables, and leaves unset ones visible", () => {
  const r = runner("= main\nset mode = SAFE\nMode: {mode} / {missing}\n* ok\n");
  assert.deepEqual(lines(r.start()), ["Mode: SAFE / {missing}"]);
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
    ["= main #clear", "Generator: {generator}", "* Toggle", "  set generator = on"].join("\n")
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
  // Pinned deliberately: `set` runs whenever it is executed, so initialisation
  // belongs in a block you divert away from, not in the menu you return to.
  const r = runner(
    ["= main", "set generator = off", "Generator: {generator}", "* Toggle", "  set generator = on"].join("\n")
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
    ["= main", "* Go -> other", "  set flag = 1", "  Leaving", "= other", "Arrived", "* ok"].join("\n")
  );
  r.start();
  const step = r.select(0);
  assert.deepEqual(lines(step), ["Leaving", "Arrived"]);
  assert.equal(r.vars.get("flag"), "1");
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

// --- the real story -------------------------------------------------------

const storySource = readFileSync(
  fileURLToPath(new URL("../assets/story.term", import.meta.url)),
  "utf8"
);

test("story.term parses with no errors", () => {
  assert.deepEqual(parse(storySource).errors, []);
});

test("a full path through story.term", () => {
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

  const toggled = r.select(0);
  assert.equal(r.currentBlock?.name, "diagnostics", "toggling stays put");
  assert.ok(lines(toggled).includes("Generator spinning up..."));
  assert.ok(lines(toggled).includes("Generator [on]"), "the screen redraws with the new state");

  const back = r.select(1);
  assert.equal(r.currentBlock?.name, "main");
  assert.ok(lines(back).includes("Generator: on"), "state survives the trip back");
  assert.deepEqual(labels(back), ["Diagnostics", "Controls", "Comms", "Reboot"]);
});

test("rebooting from the menu re-runs the boot sequence", () => {
  const r = runner(storySource);
  r.start();
  r.resume(true);
  const reboot = r.select(3);
  assert.equal(reboot.pause?.tag.name, "password", "reboot gates on the password again");
  assert.ok(lines(reboot).includes("TRAC PC-9800 Series System Terminal"));
});

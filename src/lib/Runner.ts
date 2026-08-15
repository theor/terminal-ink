import {
  type Block,
  type ChoiceNode,
  type Node,
  type Segment,
  type Story,
  type Tag,
} from "./Parser.ts";

/**
 * One thing to show. `text: null` is a line that prints nothing and exists
 * only to carry directives, e.g. a bare `#clear`.
 */
export interface Output {
  text: string | null;
  tags: Tag[];
}

export interface RunChoice {
  index: number;
  label: string;
  tags: Tag[];
}

export interface StepResult {
  /** Emitted since the previous step, in order. */
  outputs: Output[];
  /**
   * Set when execution stopped at a gate directive. No choices are offered
   * until the caller answers with `resume()`.
   */
  pause?: { tag: Tag };
  choices: RunChoice[];
  /** No way forward: the story hit `-> end` or a block with no exits. */
  halted: boolean;
}

/**
 * Directives that stop execution until the player answers. `#delay` is not one
 * of these -- it only paces the display, so it can be handled while the rest of
 * the block keeps running.
 */
const GATE_TAGS = new Set(["password"]);

/** Guards against `-> a` / `-> b` divert cycles. Per call, never global. */
const MAX_STEPS = 10000;

/**
 * A screen is what the player is looking at: a block, or the sub-menu formed by
 * the nested choices under one choice.
 */
interface Screen {
  block: Block;
  choice?: ChoiceNode;
}

interface Cursor {
  screen: Screen;
  index: number;
  /** Where to go once the screen's nodes run out. */
  onExhausted: "present" | "resolveChoice";
}

function childrenOf(screen: Screen): Node[] {
  return screen.choice ? screen.choice.children : screen.block.children;
}

function headerTagsOf(screen: Screen): Tag[] {
  return screen.choice ? screen.choice.tags : screen.block.tags;
}

export class Runner {
  readonly story: Story;
  readonly vars = new Map<string, string>();

  /** Screens the player has navigated into; the last one is current. */
  private stack: Screen[] = [];
  private cursor: Cursor | null = null;
  private outputs: Output[] = [];
  private pause: { tag: Tag } | undefined;

  choices: RunChoice[] = [];
  halted = false;

  constructor(story: Story) {
    this.story = story;
  }

  /** How deep the player has navigated. Exposed for `-> back` tests. */
  get depth(): number {
    return this.stack.length;
  }

  get currentBlock(): Block | undefined {
    return this.stack[this.stack.length - 1]?.block;
  }

  /** Runs from the first block in the document. */
  start(name?: string): StepResult {
    const before = this.outputs.length;
    const block = name ? this.story.byName.get(name) : this.story.blocks[0];
    this.stack = [];
    this.cursor = null;
    this.choices = [];
    this.halted = false;
    this.vars.clear();
    if (!block) {
      this.halted = true;
      return this.result([]);
    }
    this.enter({ block }, "push");
    return this.run(before);
  }

  select(index: number): StepResult {
    const before = this.outputs.length;
    const chosen = this.choices[index];
    const screen = this.stack[this.stack.length - 1];
    if (!chosen || !screen || this.pause) return this.result([]);

    const node = childrenOf(screen).filter(isChoice)[chosen.index];
    if (!node) return this.result([]);

    this.choices = [];
    // The choice's body runs as its own little screen; whether that screen
    // becomes the new one is decided in resolveChoice, once the body is done.
    this.cursor = {
      screen: { block: screen.block, choice: node },
      index: 0,
      onExhausted: "resolveChoice",
    };
    this.emitTags(node.tags);
    return this.run(before);
  }

  /**
   * Answers the gate that execution stopped at. `ok: false` leaves the story
   * exactly where it is and re-offers the same gate.
   */
  resume(ok: boolean): StepResult {
    if (!this.pause) return this.result([]);
    if (!ok) return this.result([]);
    const before = this.outputs.length;
    this.pause = undefined;
    return this.run(before);
  }

  // --- execution ----------------------------------------------------------

  private enter(screen: Screen, mode: "push" | "replace") {
    if (mode === "push") this.stack.push(screen);
    else this.stack[this.stack.length - 1] = screen;
    this.emitTags(headerTagsOf(screen));
    this.cursor = { screen, index: 0, onExhausted: "present" };
  }

  /** Re-runs the current screen in place. Does not grow the stack. */
  private redraw() {
    const screen = this.stack[this.stack.length - 1];
    if (!screen) {
      this.halted = true;
      this.cursor = null;
      return;
    }
    this.emitTags(headerTagsOf(screen));
    this.cursor = { screen, index: 0, onExhausted: "present" };
  }

  private jump(target: string) {
    if (target === "end") {
      this.halted = true;
      this.cursor = null;
      return;
    }
    if (target === "back") {
      // At the outermost screen there is nowhere to go back to; redraw instead.
      if (this.stack.length > 1) this.stack.pop();
      this.redraw();
      return;
    }
    const block = this.story.byName.get(target);
    if (!block) {
      this.emit(`[unknown block "${target}"]`, []);
      this.halted = true;
      this.cursor = null;
      return;
    }
    this.enter({ block }, "push");
  }

  /**
   * @param before Index the delta is measured from. Taken by the caller before
   * it emits anything, so header directives are not dropped from the result.
   */
  private run(before: number): StepResult {
    let steps = 0;

    while (this.cursor && !this.halted && !this.pause) {
      if (steps++ > MAX_STEPS) {
        this.emit("[story loops forever]", []);
        this.halted = true;
        this.cursor = null;
        break;
      }

      const { screen, index, onExhausted } = this.cursor;
      const children = childrenOf(screen);

      if (index >= children.length) {
        this.cursor = null;
        if (onExhausted === "present") this.present(screen);
        else this.resolveChoice(screen);
        continue;
      }

      this.cursor.index++;
      const node = children[index];

      switch (node.kind) {
        case "choice":
          // Collected when the screen is presented, not executed inline.
          break;
        case "text":
          // Before the render, so a `#set` on a line is visible to a `{var}`
          // on that same line -- the same order `#clear` runs in.
          this.applySets(node.tags);
          this.emit(this.render(node.segments), node.tags);
          break;
        case "directive":
          this.applySets(node.tags);
          this.emit(null, node.tags);
          break;
        case "divert":
          // Before the jump, so a `#set` here is in place by the time the
          // target block renders. Without this a tag on a divert line -- the
          // one line form that leaves the block -- would quietly do nothing.
          this.emitTags(node.tags);
          this.cursor = null;
          this.jump(node.target);
          break;
      }
    }

    return this.result(this.outputs.slice(before));
  }

  /** The screen is fully drawn: offer whatever choices it holds. */
  private present(screen: Screen) {
    this.choices = childrenOf(screen)
      .filter(isChoice)
      .map((c, index) => ({
        index,
        label: this.render(c.label),
        tags: c.tags,
      }));
    // A screen with no choices and no divert is the end of the line.
    if (this.choices.length === 0) this.halted = true;
  }

  /**
   * A choice's body has finished. Nested choices turn it into a sub-menu, an
   * inline `-> target` sends us elsewhere, and a plain choice just redraws the
   * screen we are already on -- which is how state changes become visible
   * without the back stack growing on every selection.
   */
  private resolveChoice(screen: Screen) {
    const choice = screen.choice!;
    if (choice.children.some(isChoice)) {
      this.stack.push(screen);
      this.present(screen);
      return;
    }
    if (choice.divert) {
      this.jump(choice.divert);
      return;
    }
    this.redraw();
  }

  // --- output -------------------------------------------------------------

  private emit(text: string | null, tags: Tag[]) {
    this.outputs.push({ text, tags });
    const gate = tags.find((t) => GATE_TAGS.has(t.name));
    if (gate) this.pause = { tag: gate };
  }

  private emitTags(tags: Tag[]) {
    if (tags.length === 0) return;
    this.applySets(tags);
    this.emit(null, tags);
  }

  /**
   * Applies every `#set name = value` on a line. Header tags run through here
   * on entry *and* on every redraw, so an assignment on a block header
   * re-initialises the block each time it is drawn -- put one on a block you
   * divert away from, not on a menu you come back to.
   */
  private applySets(tags: Tag[]) {
    for (const tag of tags) {
      if (tag.name === "set" && tag.args.length === 2) {
        this.vars.set(tag.args[0], tag.args[1]);
      }
    }
  }

  /** Substitutes `{var}`; an unset variable is left visible as written. */
  private render(segments: Segment[]): string {
    return segments
      .map((s) =>
        s.kind === "text" ? s.value : this.vars.get(s.name) ?? `{${s.name}}`
      )
      .join("");
  }

  private result(outputs: Output[]): StepResult {
    return {
      outputs,
      pause: this.pause,
      choices: this.pause ? [] : this.choices,
      halted: this.halted,
    };
  }
}

function isChoice(node: Node): node is ChoiceNode {
  return node.kind === "choice";
}

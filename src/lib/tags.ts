/**
 * Every tag the format has, defined once.
 *
 * A tag used to be spelled out in five places -- a rule in the grammar, a
 * semantics action, a check in the parser's validation, a case in the runner
 * and another in the terminal. The grammar now only knows the two *shapes* a
 * tag can take, and everything else about it lives in the entry below: how it
 * is written, where it may be written, what it does to the story, and what it
 * does to the screen.
 *
 * Adding a tag means adding an entry here.
 */

export type Vars = Map<string, string>;

/** Where a tag is written. A spec may restrict itself to some of these. */
export type TagPosition = "header" | "text" | "own" | "choice" | "divert";

export const ALL_POSITIONS: TagPosition[] = [
  "header",
  "text",
  "own",
  "choice",
  "divert",
];

/** The part of the terminal a tag is allowed to touch. */
export interface TerminalUI {
  clear(): void;
  setSpeed(ms: number): void;
  setTheme(name: string): void;
  /** Print the line this tag sits on as a heading rather than body text. */
  asHeading(): void;
  wait(ms: number): Promise<void>;
}

export interface TagSpec {
  name: string;
  /**
   * `pair` is `#name lhs = rhs`, whose value keeps its spaces. `args` is
   * `#name a b`, split on whitespace.
   */
  shape: "pair" | "args";
  /** Inclusive argument count, for an `args` tag. */
  arity?: [min: number, max: number];
  /** Positions the tag means something in. Everywhere, by default. */
  positions?: TagPosition[];
  /** How to write it, quoted back at the author when they get it wrong. */
  syntax: string;
  /** Changes story state. Runs before the line it sits on is rendered. */
  apply?: (vars: Vars, args: string[]) => void;
  /**
   * Decides whether the line runs at all. A false answer skips the line and
   * everything else on it, and hides a choice rather than blanking its label.
   */
  allows?: (vars: Vars, args: string[]) => boolean;
  /** Stops the runner until the player answers. */
  gate?: boolean;
  /**
   * Changes the display. `before` runs ahead of the line the tag sits on,
   * `after` once that line has finished typing.
   */
  view?: {
    phase: "before" | "after";
    run: (ui: TerminalUI, args: string[]) => void | Promise<void>;
  };
}

export const TAGS: TagSpec[] = [
  {
    name: "set",
    shape: "pair",
    syntax: "#set name = value",
    apply: (vars, [name, value]) => vars.set(name, value),
  },
  {
    name: "if",
    shape: "pair",
    // Not on a block header: there is no sensible answer to what suppressing
    // a whole screen would mean, and the header runs again on every redraw.
    positions: ["text", "own", "choice", "divert"],
    syntax: "#if name = value",
    // An unset variable matches nothing, the same way it prints as `{name}`
    // rather than as blank -- a value that was never set is visibly not there.
    allows: (vars, [name, value]) => vars.get(name) === value,
  },
  {
    name: "clear",
    shape: "args",
    arity: [0, 0],
    syntax: "#clear",
    view: { phase: "before", run: (ui) => ui.clear() },
  },
  {
    name: "title",
    shape: "args",
    arity: [0, 0],
    // A heading decorates a printed line; there is nothing for it to do on a
    // line that prints nothing, or on a choice.
    positions: ["text"],
    syntax: "#title, at the end of a line of text",
    view: { phase: "before", run: (ui) => ui.asHeading() },
  },
  {
    name: "delay",
    shape: "args",
    arity: [0, 1],
    syntax: "#delay, or #delay <milliseconds>",
    view: {
      phase: "after",
      run: (ui, [ms]) => ui.wait(parseInt(ms ?? "1500")),
    },
  },
  {
    name: "speed",
    shape: "args",
    arity: [1, 1],
    syntax: "#speed <milliseconds per character>",
    view: {
      phase: "before",
      // Guarded rather than assumed: a story with parse errors still runs.
      run: (ui, [ms]) => {
        if (ms) ui.setSpeed(parseInt(ms));
      },
    },
  },
  {
    name: "theme",
    shape: "args",
    arity: [1, 1],
    syntax: "#theme <name>",
    view: {
      phase: "before",
      run: (ui, [name]) => {
        if (name) ui.setTheme(name);
      },
    },
  },
  {
    name: "password",
    shape: "args",
    arity: [0, 1],
    syntax: "#password <word>",
    gate: true,
  },
];

const BY_NAME = new Map(TAGS.map((spec) => [spec.name, spec]));

/** Undefined for a tag nothing consumes -- those are inert, not errors. */
export function tagSpec(name: string): TagSpec | undefined {
  return BY_NAME.get(name);
}

export function positionsOf(spec: TagSpec): TagPosition[] {
  return spec.positions ?? ALL_POSITIONS;
}

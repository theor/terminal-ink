/**
 * Every tag the format has, defined once.
 *
 * A tag used to be spelled out in five places -- a rule in the grammar, a
 * semantics action, a check in the parser's validation, a case in the runner
 * and another in the terminal. The grammar now knows one shape for all of them
 * -- a name and whitespace-separated arguments -- and everything else about a
 * tag lives in its entry below: how its arguments are read, where it may be
 * written, what it does to the story, and what it does to the screen.
 *
 * The `=` in `#set x = 1` is an argument like any other. Nothing outside this
 * file knows it is there, which is what keeps the grammar free of per-tag
 * structure.
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

/**
 * Reads the raw whitespace-separated arguments and returns the tag's values,
 * or null if they are not written the way the tag wants. Everything a tag
 * knows about its own syntax lives in here, which is why the grammar can treat
 * every tag alike.
 */
export type Bind = (args: string[]) => string[] | null;

/** Takes between `min` and `max` arguments, and passes them through. */
const count =
  (min: number, max = min): Bind =>
  (args) =>
    args.length >= min && args.length <= max ? args : null;

/**
 * `name = value`, shared by `#set` and `#if`. The `=` is not structure the
 * parser knows about -- it is an argument like any other, checked here -- and
 * the value is whatever follows, so it may hold spaces.
 */
const assignment: Bind = (args) =>
  args.length >= 3 && args[1] === "=" ? [args[0], args.slice(2).join(" ")] : null;

export interface TagSpec {
  name: string;
  /** How the arguments are read. See `Bind`. */
  bind: Bind;
  /** Positions the tag means something in. Everywhere, by default. */
  positions?: TagPosition[];
  /** How to write it, quoted back at the author when they get it wrong. */
  syntax: string;
  /**
   * Changes story state. Runs before the line it sits on is rendered. Takes
   * the values `bind` returned, not the raw arguments.
   */
  apply?: (vars: Vars, values: string[]) => void;
  /**
   * Decides whether the line runs at all. A false answer skips the line and
   * everything else on it, and hides a choice rather than blanking its label.
   */
  allows?: (vars: Vars, values: string[]) => boolean;
  /** Stops the runner until the player answers. */
  gate?: boolean;
  /**
   * Changes the display. `before` runs ahead of the line the tag sits on,
   * `after` once that line has finished typing.
   */
  view?: {
    phase: "before" | "after";
    run: (ui: TerminalUI, values: string[]) => void | Promise<void>;
  };
}

export const TAGS: TagSpec[] = [
  {
    name: "set",
    bind: assignment,
    syntax: "#set name = value",
    apply: (vars, [name, value]) => vars.set(name, value),
  },
  {
    name: "if",
    bind: assignment,
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
    bind: count(0),
    syntax: "#clear",
    view: { phase: "before", run: (ui) => ui.clear() },
  },
  {
    name: "title",
    bind: count(0),
    // A heading decorates a printed line; there is nothing for it to do on a
    // line that prints nothing, or on a choice.
    positions: ["text"],
    syntax: "#title, at the end of a line of text",
    view: { phase: "before", run: (ui) => ui.asHeading() },
  },
  {
    name: "delay",
    bind: count(0, 1),
    syntax: "#delay, or #delay <milliseconds>",
    view: {
      phase: "after",
      run: (ui, [ms]) => ui.wait(parseInt(ms ?? "1500")),
    },
  },
  {
    name: "speed",
    bind: count(1),
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
    bind: count(1),
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
    bind: count(0, 1),
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

/**
 * The values a tag was written with, or null if it was written wrongly -- and
 * null too for a tag nothing knows about, which is inert rather than an error.
 * Everything that acts on a tag goes through here, so a malformed one does
 * nothing instead of doing something odd with the wrong arguments.
 */
export function tagValues(name: string, args: string[]): string[] | null {
  return tagSpec(name)?.bind(args) ?? null;
}

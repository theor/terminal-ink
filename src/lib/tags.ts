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

import { evaluate, parseExpr, varsIn, type Expr, type Value } from "./expr.ts";

export type Vars = Map<string, Value>;

/** `#set name = <expression>` and `#if <expression>` bind to these. */
export interface Assignment {
  name: string;
  value: Expr;
}

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
export type Bind<T> = (args: string[]) => T | null;

/**
 * Takes between `min` and `max` arguments, unquoted. Quotes are how an
 * argument holds a space or a `#`; a tag that is not reading an expression has
 * no use for the marks themselves, so `#password "two words"` is those two
 * words rather than a password with quotes around it.
 */
const count =
  (min: number, max = min): Bind<string[]> =>
  (args) =>
    args.length >= min && args.length <= max ? args.map(unquote) : null;

const unquote = (arg: string): string =>
  arg.length >= 2 && arg.startsWith('"') && arg.endsWith('"')
    ? arg.slice(1, -1)
    : arg;

/**
 * `name = <expression>`. The `=` is not structure the parser knows about -- it
 * is an argument like any other, checked here -- and everything after it is
 * joined back up and parsed as an expression.
 */
const assignment: Bind<Assignment> = (args) => {
  if (args.length < 3 || args[1] !== "=") return null;
  const value = parseExpr(args.slice(2).join(" "));
  return value ? { name: args[0], value } : null;
};

/** `#if <expression>`, which is every argument joined back up. */
const condition: Bind<Expr> = (args) =>
  args.length > 0 ? parseExpr(args.join(" ")) : null;

export interface TagSpec<T = any> {
  name: string;
  /** How the arguments are read. See `Bind`. */
  bind: Bind<T>;
  /** Positions the tag means something in. Everywhere, by default. */
  positions?: TagPosition[];
  /** How to write it, quoted back at the author when they get it wrong. */
  syntax: string;
  /**
   * Changes story state. Runs before the line it sits on is rendered. Takes
   * the values `bind` returned, not the raw arguments.
   */
  apply?: (vars: Vars, values: T) => void;
  /**
   * Decides whether the line runs at all. A false answer skips the line and
   * everything else on it, and hides a choice rather than blanking its label.
   */
  allows?: (vars: Vars, values: T) => boolean;
  /** Stops the runner until the player answers. */
  gate?: boolean;
  /**
   * The tag says what kind of thing it is written on, rather than doing
   * anything where it appears: `#prelude` marks a block the runner applies for
   * its assignments instead of entering. Whoever cares looks the mark up, so
   * there is nothing to run here -- but it is not inert either.
   */
  marker?: boolean;
  /**
   * Variable names the tag reads and assigns, for the parser's check that a
   * name used anywhere is assigned somewhere. Declared here rather than read
   * off the tag by the parser, which knows nothing about any particular tag.
   */
  reads?: (values: T) => string[];
  writes?: (values: T) => string[];
  /**
   * The tag sets something that holds until it is set again, rather than
   * acting on the line it sits on. A sticky tag is a *setting*, which is why
   * one may be written in a `#prelude`: there is no line there for it to act
   * on, but a setting does not need one.
   */
  sticky?: boolean;
  /**
   * Changes the display. `before` runs ahead of the line the tag sits on,
   * `after` once that line has finished typing.
   */
  view?: {
    phase: "before" | "after";
    run: (ui: TerminalUI, values: T) => void | Promise<void>;
  };
}

export const TAGS: TagSpec[] = [
  {
    name: "set",
    bind: assignment,
    syntax: '#set name = <expression>, e.g. #set candle = "lit"',
    apply: (vars, { name, value }) => {
      // An expression with no answer leaves the variable alone rather than
      // storing a hole -- unset stays unset, which is a state the rest of the
      // format already knows how to talk about.
      const result = evaluate(value, vars);
      if (result) vars.set(name, result);
    },
    reads: ({ value }) => varsIn(value),
    writes: ({ name }) => [name],
  },
  {
    name: "prelude",
    bind: count(0),
    marker: true,
    // A whole block is marked, not a line: the point is a place to declare
    // variables away from the story's flow, and a block is the only thing the
    // format has that holds several lines.
    positions: ["header"],
    syntax: "#prelude, on a block header",
  },
  {
    name: "if",
    bind: condition,
    // Not on a block header: there is no sensible answer to what suppressing
    // a whole screen would mean, and the header runs again on every redraw.
    positions: ["text", "own", "choice", "divert"],
    syntax: '#if <expression>, e.g. #if coolant = "low"',
    // Only a plain yes runs the line. An unset variable, or an operator with
    // nothing to say about the types it was given, is no answer -- and no
    // answer is not a yes.
    allows: (vars, expr) => {
      const result = evaluate(expr, vars);
      return result?.kind === "boolean" && result.value;
    },
    reads: (expr) => varsIn(expr),
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
    sticky: true,
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
    sticky: true,
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
 * Whether a tag touches story state rather than the display. These are the
 * ones the editor colours as keywords.
 */
export function touchesState(spec: TagSpec): boolean {
  return Boolean(spec.apply || spec.allows);
}

/**
 * Whether a tag says how things *are*, rather than doing something at the
 * point it is written -- which is exactly what may be declared in a `#prelude`
 * block. State and settings qualify; `#clear`, `#delay`, `#title` and
 * `#password` do not, because each acts on a line, and a prelude has none.
 */
export function isDeclaration(spec: TagSpec): boolean {
  return touchesState(spec) || Boolean(spec.sticky) || Boolean(spec.marker);
}

/** Names a tag assigns, and names it reads. Empty for a tag that does neither. */
export function varsOf(name: string, args: string[]): {
  reads: string[];
  writes: string[];
} {
  const spec = tagSpec(name);
  const values = spec?.bind(args);
  // A tag written wrongly is reported on its own; there is nothing to read
  // names out of, and guessing would report a second error for the same typo.
  if (!spec || values === null || values === undefined) {
    return { reads: [], writes: [] };
  }
  return {
    reads: spec.reads?.(values) ?? [],
    writes: spec.writes?.(values) ?? [],
  };
}

/**
 * The values a tag was written with, or null if it was written wrongly -- and
 * null too for a tag nothing knows about, which is inert rather than an error.
 * Everything that acts on a tag goes through here, so a malformed one does
 * nothing instead of doing something odd with the wrong arguments.
 */
export function tagValues(name: string, args: string[]): unknown | null {
  return tagSpec(name)?.bind(args) ?? null;
}

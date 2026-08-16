import type { MatchResult } from "ohm-js";
import grammar from "./grammar.ohm-bundle.js";
import type { TerminalSemantics } from "./grammar.ohm-bundle.js";
import { positionsOf, tagSpec, type TagPosition } from "./tags.ts";

/** A run of literal text, or a `{variable}` to be substituted at runtime. */
export type Segment =
  | { kind: "text"; value: string }
  | { kind: "var"; name: string };

/**
 * `#delay 800` -> `{ name: "delay", args: ["800"] }`
 *
 * Arguments are whatever the line held, split on whitespace and nothing more:
 * `#set x = 1` is three of them. Reading them as a name and a value is
 * `tags.ts`'s job, so the parser has no per-tag knowledge at all.
 */
export interface Tag {
  name: string;
  args: string[];
}

interface NodeBase {
  /** 0-based index of the source line this node came from. */
  line: number;
  indent: number;
  tags: Tag[];
}

export interface TextNode extends NodeBase {
  kind: "text";
  segments: Segment[];
}
/** A line holding nothing but directives, e.g. `#clear`. Prints nothing. */
export interface DirectiveNode extends NodeBase {
  kind: "directive";
}
export interface ChoiceNode extends NodeBase {
  kind: "choice";
  label: Segment[];
  /** Inline `-> target` written on the choice line itself. */
  divert?: string;
  children: Node[];
}
export interface DivertNode extends NodeBase {
  kind: "divert";
  target: string;
}

export type Node = TextNode | DirectiveNode | ChoiceNode | DivertNode;

export interface Block {
  name: string;
  tags: Tag[];
  line: number;
  children: Node[];
}

export interface ParseError {
  /** 0-based source line. */
  line: number;
  /** 0-based column. */
  column: number;
  message: string;
}

export interface Story {
  blocks: Block[];
  /** Blocks by name, for divert resolution. First wins on duplicates. */
  byName: Map<string, Block>;
  errors: ParseError[];
}

/** Name given to the implicit block wrapping content written before any `=`. */
export const IMPLICIT_BLOCK = "start";

/**
 * Characters a backslash may escape. Mirrors `escapable` in grammar.ohm --
 * change both together. A backslash before anything else is a plain backslash,
 * which is what lets a terminal print `C:\Users` unaltered.
 */
export const ESCAPABLE = "#{}=*-/";


// --- line-level semantics -------------------------------------------------

type LineResult =
  | { kind: "blank" | "comment" }
  | { kind: "block"; indent: number; name: string; tags: Tag[] }
  | { kind: "text"; indent: number; segments: Segment[]; tags: Tag[] }
  | { kind: "directive"; indent: number; tags: Tag[] }
  | {
      kind: "choice";
      indent: number;
      label: Segment[];
      divert?: string;
      tags: Tag[];
    }
  | { kind: "divert"; indent: number; target: string; tags: Tag[] };

const semantics: TerminalSemantics = grammar.createSemantics();

semantics.addOperation<any>("parse", {
  line(l) {
    return l.parse();
  },
  commentLine(_i, _slashes, _rest) {
    return { kind: "comment" };
  },
  blankLine(_hs) {
    return { kind: "blank" };
  },
  blockLine(i, _eq, _h1, name, _h2, tags) {
    return {
      kind: "block",
      indent: indentOf(i),
      name: name.sourceString,
      tags: tags.parse(),
    };
  },
  textLine(i, body, tags) {
    return {
      kind: "text",
      indent: indentOf(i),
      segments: body.parse(),
      tags: tags.parse(),
    };
  },
  tagLine(i, tags) {
    return {
      kind: "directive",
      indent: indentOf(i),
      tags: tags.children.map((c) => c.parse()),
    };
  },
  choiceLine(i, _star, _h, body, divert, tags) {
    return {
      kind: "choice",
      indent: indentOf(i),
      label: body.parse(),
      divert: divert.numChildren > 0 ? divert.child(0).parse() : undefined,
      tags: tags.parse(),
    };
  },
  divertLine(i, divert, tags) {
    return {
      kind: "divert",
      indent: indentOf(i),
      target: divert.parse(),
      tags: tags.parse(),
    };
  },
  divert(_arrow, _h1, name, _h2) {
    return name.sourceString;
  },
  body(segments) {
    return normalizeSegments(segments.children.map((c) => c.parse()));
  },
  segment(s) {
    return s.parse();
  },
  interp(_open, _h1, name, _h2, _close) {
    return { kind: "var", name: name.sourceString };
  },
  chunk(_chars) {
    return { kind: "text", value: this.sourceString };
  },
  escape(_backslash, ch) {
    return { kind: "text", value: ch.sourceString };
  },
  tags(list) {
    return list.children.map((c) => c.parse());
  },
  tag(_hash, name, args, _hs) {
    return {
      name: name.sourceString,
      args: args.children.map((a) => a.parse()),
    };
  },
  tagArg(_hs, token) {
    return token.sourceString;
  },
  _iter(...children) {
    return children.map((c) => c.parse());
  },
  _terminal() {
    return this.sourceString;
  },
});

/**
 * Width of a leading-whitespace run. Tabs count as one column, so a document
 * should not mix tabs and spaces for indentation.
 */
function indentOf(node: { sourceString: string }): number {
  return node.sourceString.length;
}

/**
 * Joins neighbouring literals, drops empty runs and trims the outer edges,
 * keeping interior spacing. Escapes arrive as segments of their own, so
 * `abc\#def` has to come back out as one literal rather than three.
 */
function normalizeSegments(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const segment of segments) {
    const prev = merged[merged.length - 1];
    // Copied, never mutated in place: the same segment object would otherwise
    // be shared with the node the trimming below edits.
    if (segment.kind === "text" && prev?.kind === "text") prev.value += segment.value;
    else merged.push({ ...segment });
  }

  const out = merged.filter((s) => s.kind !== "text" || s.value.length > 0);
  const first = out[0];
  if (first?.kind === "text") first.value = first.value.replace(/^\s+/, "");
  const last = out[out.length - 1];
  if (last?.kind === "text") last.value = last.value.replace(/\s+$/, "");
  return out.filter((s) => s.kind !== "text" || s.value.length > 0);
}

// --- document assembly ----------------------------------------------------

/**
 * Parses a whole document. Lines are matched independently, so a line that
 * fails is reported on its own and every other line still contributes to the
 * story -- which is what makes live-reparsing on each keystroke usable.
 */
export function parse(source: string): Story {
  const story: Story = { blocks: [], byName: new Map(), errors: [] };

  // Stack of open containers. The bottom entry is the current block body.
  let stack: { indent: number; children: Node[] }[] = [];
  let block: Block | undefined;

  const openBlock = (b: Block) => {
    if (story.byName.has(b.name)) {
      story.errors.push({
        line: b.line,
        column: 0,
        message: `Duplicate block name "${b.name}"`,
      });
    } else {
      story.byName.set(b.name, b);
    }
    story.blocks.push(b);
    block = b;
    stack = [{ indent: -1, children: b.children }];
  };

  const push = (node: Node) => {
    if (!block) {
      // Content before any `=` header goes into an implicit block, so a
      // brand-new document runs without the author writing a header first.
      openBlock({ name: IMPLICIT_BLOCK, tags: [], line: node.line, children: [] });
    }
    while (stack.length > 1 && node.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    if (node.kind === "choice") {
      stack.push({ indent: node.indent, children: node.children });
    }
  };

  const lines = source.split("\n");
  // A trailing newline terminates the last line, it does not start a new one.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].replace(/\r$/, "");
    const m = grammar.match(text, "line");
    if (m.failed()) {
      story.errors.push({
        line: i,
        column: columnOf(m),
        message: shortMessage(m),
      });
      continue;
    }
    const r: LineResult = semantics(m).parse();

    switch (r.kind) {
      case "comment":
        break;
      case "blank":
        // A blank line is real output (terminals use them for spacing) but
        // carries no indentation, so it must not close any open choice.
        if (block) {
          stack[stack.length - 1].children.push({
            kind: "text",
            segments: [],
            tags: [],
            line: i,
            indent: stack[stack.length - 1].indent + 1,
          });
        }
        break;
      case "block":
        openBlock({ name: r.name, tags: r.tags, line: i, children: [] });
        break;
      case "text":
        push({ kind: "text", segments: r.segments, tags: r.tags, line: i, indent: r.indent });
        break;
      case "directive":
        push({ kind: "directive", tags: r.tags, line: i, indent: r.indent });
        break;
      case "choice":
        push({
          kind: "choice",
          label: r.label,
          divert: r.divert,
          children: [],
          tags: r.tags,
          line: i,
          indent: r.indent,
        });
        break;
      case "divert":
        push({ kind: "divert", target: r.target, tags: r.tags, line: i, indent: r.indent });
        break;
    }
  }

  validate(story);
  return story;
}

/**
 * Reports diverts pointing at a block which does not exist, and tags that do
 * not match what `tags.ts` says they should look like. The grammar accepts any
 * tag in either shape, so everything specific to a tag is checked here -- a
 * tag that means something must never sit in the output doing nothing quietly.
 */
function validate(story: Story) {
  const walk = (nodes: Node[]) => {
    for (const node of nodes) {
      checkTags(node.tags, node.line, positionOf(node));
      if (node.kind === "divert") checkTarget(node.target, node.line);
      if (node.kind === "choice") {
        if (node.divert) checkTarget(node.divert, node.line);
        walk(node.children);
      }
    }
  };
  const checkTarget = (target: string, line: number) => {
    if (isSpecialTarget(target) || story.byName.has(target)) return;
    story.errors.push({
      line,
      column: 0,
      message: `Unknown block "${target}"`,
    });
  };
  const fail = (line: number, message: string) =>
    story.errors.push({ line, column: 0, message });

  const checkTags = (tags: Tag[], line: number, position: TagPosition) => {
    for (const tag of tags) {
      const spec = tagSpec(tag.name);
      // A tag nothing consumes is inert by design -- only a tag that means
      // something can be written wrongly.
      if (!spec) continue;

      if (spec.bind(tag.args) === null) {
        fail(line, `#${tag.name} is written as \`${spec.syntax}\``);
        continue;
      }
      if (!positionsOf(spec).includes(position)) {
        fail(line, `#${tag.name} does nothing ${WHERE[position]}`);
      }
    }
  };
  for (const block of story.blocks) {
    checkTags(block.tags, block.line, "header");
    walk(block.children);
  }
}

/** Reads back inside "#title does nothing ...". */
const WHERE: Record<TagPosition, string> = {
  header: "on a block header",
  text: "on a line of text",
  own: "on a line of its own",
  choice: "on a choice",
  divert: "on a divert",
};

function positionOf(node: Node): TagPosition {
  switch (node.kind) {
    case "text":
      return "text";
    case "directive":
      return "own";
    case "choice":
      return "choice";
    case "divert":
      return "divert";
  }
}

/**
 * The block a source line falls inside: the last one whose header sits at or
 * above it. A line above the first header still belongs to a block -- the
 * implicit one -- so the answer is only empty for a story with no blocks.
 *
 * The result is a block, but a caller running it will go through `byName`,
 * where a duplicate name resolves to the first of them. A cursor inside the
 * second `= main` therefore names `main` and runs the first one.
 */
export function blockAt(story: Story, line: number): Block | undefined {
  let found: Block | undefined;
  // Blocks are pushed as the document is read, so they are in source order.
  for (const block of story.blocks) {
    if (block.line > line) break;
    found = block;
  }
  return found ?? story.blocks[0];
}

/** Divert targets handled by the runner rather than resolved to a block. */
export function isSpecialTarget(target: string): boolean {
  return target === "back" || target === "end";
}

function columnOf(m: MatchResult): number {
  const pos = (m as any).getRightmostFailurePosition?.() ?? 0;
  return typeof pos === "number" ? pos : 0;
}

function shortMessage(m: MatchResult): string {
  const short = (m as any).shortMessage as string | undefined;
  // Ohm prefixes "Line 1, col N: " -- redundant, we report the real line.
  return (short ?? "Parse error").replace(/^Line \d+, col \d+: /, "");
}

// --- debug rendering ------------------------------------------------------

export function segmentsToString(segments: Segment[]): string {
  return segments
    .map((s) => (s.kind === "text" ? s.value : `{${s.name}}`))
    .join("");
}

/**
 * Puts back the backslashes the parser took out, so `stringify` output parses
 * to the same tree. Only what would be read back as structure is escaped --
 * escaping every `-` would turn readable prose into line noise.
 */
function toSource(text: string): string {
  const escaped = text.replace(/[#{]/g, "\\$&").replace(/->/g, "\\->");
  // A sigil only opens a line form at the start of one.
  return /^(=|\*|\/\/)/.test(escaped) ? "\\" + escaped : escaped;
}

function segmentsToSource(segments: Segment[]): string {
  return segments
    .map((s) => (s.kind === "text" ? toSource(s.value) : `{${s.name}}`))
    .join("");
}

function tagToString(tag: Tag): string {
  return `#${tag.name}${tag.args.map((a) => " " + a).join("")}`;
}

function tagsToString(tags: Tag[]): string {
  if (tags.length === 0) return "";
  return " " + tags.map(tagToString).join(" ");
}

function nodeToString(node: Node, depth: number): string {
  const pad = "  ".repeat(depth);
  switch (node.kind) {
    case "text":
      // A blank line stays blank -- padding it would make it grow on re-parse.
      if (node.segments.length === 0 && node.tags.length === 0) return "";
      return pad + segmentsToSource(node.segments) + tagsToString(node.tags);
    case "directive":
      return pad + tagsToString(node.tags).trimStart();
    case "divert":
      return `${pad}-> ${node.target}${tagsToString(node.tags)}`;
    case "choice": {
      const head =
        `${pad}* ${segmentsToSource(node.label)}` +
        (node.divert ? ` -> ${node.divert}` : "") +
        tagsToString(node.tags);
      return [head, ...node.children.map((c) => nodeToString(c, depth + 1))].join("\n");
    }
  }
}

/** Renders the parsed story back to source form -- handy for eyeballing the AST. */
export function stringify(story: Story): string {
  return story.blocks
    .map((b) =>
      [`= ${b.name}${tagsToString(b.tags)}`, ...b.children.map((c) => nodeToString(c, 1))].join("\n")
    )
    .join("\n");
}

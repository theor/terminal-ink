/**
 * The `.lore` editor: everything CodeMirror, behind a small interface.
 *
 * It lives in its own module so the component can `import type` from here and
 * load the rest only when there is an editor to show -- play mode never has
 * one. Nothing above this file mentions CodeMirror.
 */
import { EditorState, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  toggleComment,
} from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import type { ParseError } from "./Parser.ts";
import { TAGS, touchesState } from "./tags.ts";

/**
 * Tags that touch story state, as opposed to the display. Built from the
 * registry, so a new tag highlights without an edit here.
 */
const STATE_TAGS = new RegExp(
  `#(${TAGS.filter(touchesState)
    .map((t) => t.name)
    .join("|")})\\b`
);

/**
 * A line-based tokenizer, matching the line forms in `grammar.ohm` closely
 * enough to colour them -- it is not the parser, and does not have to agree
 * with it about what is an error.
 */
const lore = StreamLanguage.define({
  name: "lore",
  token(stream) {
    // The forms that only mean something at the start of a line. Each is
    // written to fail unless it matches at the very beginning, so a `=` or a
    // `*` in the middle of prose stays prose.
    if (stream.sol()) {
      if (stream.match(/[ \t]*\/\//)) {
        stream.skipToEnd();
        return "comment";
      }
      if (stream.match(/[ \t]*=[ \t]*\w+/)) return "loreHeader";
      if (stream.match(/[ \t]*\*/)) return "loreChoice";
      // Indentation is not a token; consuming it lets the rules below run
      // against the rest of the line.
      if (stream.match(/[ \t]+/)) return null;
    }
    // First, so an escaped sigil is not coloured as the thing it would
    // otherwise open.
    if (stream.match(/\\[#{}=*\-/]/)) return "loreEscape";
    if (stream.match(STATE_TAGS)) return "loreStateTag";
    if (stream.match(/#\w+/)) return "loreTag";
    if (stream.match(/->[ \t]*\w*/)) return "loreDivert";
    if (stream.match(/\{[ \t]*\w+[ \t]*\}/)) return "loreInterp";
    stream.next();
    return null;
  },
  /**
   * Every name is prefixed, because `StreamLanguage` merges this table with
   * one of legacy CodeMirror 5 token names and those win: a token called
   * `tag` silently becomes `tagName` (which inherits `typeName`'s colour) and
   * one called `header` becomes `heading`. Prefixed names cannot collide.
   */
  tokenTable: {
    comment: tags.comment,
    loreHeader: tags.keyword,
    loreChoice: tags.keyword,
    // A tag that changes or reads story state reads as a keyword; the ones
    // that only change the display do not.
    loreStateTag: tags.keyword,
    loreTag: tags.annotation,
    loreDivert: tags.typeName,
    loreInterp: tags.variableName,
    loreEscape: tags.escape,
  },
  languageData: { commentTokens: { line: "//" } },
});

const highlight = HighlightStyle.define([
  { tag: tags.comment, color: "#6a9955" },
  { tag: tags.keyword, color: "#569cd6" },
  { tag: tags.annotation, color: "#dcdcaa" },
  { tag: tags.typeName, color: "#4ec9b0" },
  { tag: tags.variableName, color: "#9cdcfe" },
  { tag: tags.escape, color: "#d7ba7d" },
]);

/**
 * Indentation nests choices, so it has to be visible -- and a tab counts as
 * one column here, which makes mixing tabs and spaces a real trap. Shading the
 * leading whitespace shows both: how deep a line sits, and where two lines
 * that look aligned are not. Only the indentation is marked, because that is
 * the whitespace that means something; the rest of the line is prose.
 */
const indentMark = Decoration.mark({ class: "cm-lore-indent" });

function markIndents(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      const indent = /^[ \t]+/.exec(line.text);
      if (indent) builder.add(line.from, line.from + indent[0].length, indentMark);
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const showIndents = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = markIndents(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = markIndents(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

/** Dark chrome, close to what the editor looked like before. */
const theme = EditorView.theme(
  {
    "&": { height: "100%", color: "#d4d4d4", backgroundColor: "#1e1e1e" },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "Consolas, 'Courier New', monospace",
      lineHeight: "1.5",
    },
    ".cm-gutters": {
      backgroundColor: "#1e1e1e",
      color: "#858585",
      border: "none",
    },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#aeafad" },
    ".cm-activeLine": { backgroundColor: "#ffffff08" },
    ".cm-activeLineGutter": { backgroundColor: "#ffffff0d", color: "#c6c6c6" },
    ".cm-lore-indent": { backgroundColor: "#ffffff0d" },
  },
  { dark: true }
);

export interface LoreEditor {
  /** Replaces the whole document, e.g. when another story is loaded. */
  setDoc(text: string): void;
  /**
   * Shows the parser's errors and warnings in the gutter and under the
   * offending text, each drawn according to its own severity.
   */
  setErrors(errors: ParseError[]): void;
  /** Puts the cursor on an error and scrolls it into view. */
  goTo(error: ParseError): void;
  destroy(): void;
}

export interface LoreEditorOptions {
  doc: string;
  onChange(text: string): void;
  /** 0-based, to match the parser rather than the editor. */
  onCursorLine(line: number): void;
}

export function createEditor(
  parent: HTMLElement,
  { doc, onChange, onCursorLine }: LoreEditorOptions
): LoreEditor {
  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    search(),
    lintGutter(),
    // Tab indents rather than moving focus: indentation is structure in this
    // format. `Mod-/` is spelled out rather than assumed from the defaults.
    keymap.of([
      indentWithTab,
      { key: "Mod-/", run: toggleComment },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
    lore,
    syntaxHighlighting(highlight),
    showIndents,
    theme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
      if (update.docChanged || update.selectionSet) {
        const head = update.state.selection.main.head;
        onCursorLine(update.state.doc.lineAt(head).number - 1);
      }
    }),
  ];

  const view = new EditorView({ parent, state: EditorState.create({ doc, extensions }) });

  /** A parse error, clamped to a range the document actually has. */
  const rangeOf = (error: ParseError): Diagnostic => {
    const line = view.state.doc.line(
      Math.min(error.line + 1, view.state.doc.lines)
    );
    return {
      from: Math.min(line.from + error.column, line.to),
      to: line.to,
      severity: error.severity ?? "error",
      message: error.message,
    };
  };

  return {
    setDoc(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: 0 },
      });
    },
    setErrors(errors) {
      view.dispatch(setDiagnostics(view.state, errors.map(rangeOf)));
    },
    goTo(error) {
      const { from } = rangeOf(error);
      view.dispatch({
        selection: { anchor: from },
        effects: EditorView.scrollIntoView(from, { y: "center" }),
      });
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}

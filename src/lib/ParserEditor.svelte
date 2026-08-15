<script lang="ts">
  import { onMount } from "svelte";
  import type monaco from "monaco-editor";
  import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

  import initialSource from "../assets/story.term?raw";
  import { parse, type ParseError } from "./Parser.ts";
  import { Runner } from "./Runner.ts";
  import Terminal from "./Terminal.svelte";

  /** How long to wait after a keystroke before restarting the preview. */
  const RESTART_DELAY = 500;

  let source = $state(initialSource);
  let story = $derived(parse(source));
  let errors = $derived(story.errors);

  // Replaced -- not mutated -- so the Terminal restarts on a fresh Runner.
  let runner = $state(new Runner(parse(initialSource)));

  let divEl: HTMLDivElement = $state(null!);
  // $state so the marker effect below re-runs once Monaco has finished loading.
  let editor = $state<monaco.editor.IStandaloneCodeEditor | undefined>();
  let Monaco = $state<typeof monaco | undefined>();

  function restart() {
    runner = new Runner(story);
  }

  let firstParse = true;
  $effect(() => {
    // Editing restarts the preview from the top once typing settles. The very
    // first parse is already running, so it is skipped.
    const current = story;
    if (firstParse) {
      firstParse = false;
      return;
    }
    const handle = setTimeout(() => {
      runner = new Runner(current);
    }, RESTART_DELAY);
    return () => clearTimeout(handle);
  });

  $effect(() => {
    // Read first: an early return before this would leave the effect with no
    // dependency on the errors and it would never run again.
    const current = errors;
    const model = editor?.getModel();
    if (!Monaco || !model) return;
    Monaco.editor.setModelMarkers(
      model,
      "terminal",
      current.map((e: ParseError) => ({
        severity: Monaco!.MarkerSeverity.Error,
        message: e.message,
        startLineNumber: e.line + 1,
        endLineNumber: e.line + 1,
        startColumn: e.column + 1,
        endColumn: 1000,
      }))
    );
  });

  function goTo(error: ParseError) {
    editor?.revealLineInCenter(error.line + 1);
    editor?.setPosition({ lineNumber: error.line + 1, column: error.column + 1 });
    editor?.focus();
  }

  onMount(() => {
    // @ts-ignore -- Monaco reads this off the global.
    self.MonacoEnvironment = { getWorker: () => new editorWorker() };

    const ready = import("monaco-editor").then((m) => {
      Monaco = m;
      Monaco.languages.register({ id: "terminal" });
      Monaco.languages.setMonarchTokensProvider("terminal", {
        tokenizer: {
          root: [
            [/^\s*\/\/.*$/, "comment"],
            [/^\s*=\s*\w+/, "keyword"],
            [/^\s*\*/, "keyword"],
            [/^\s*set\b/, "keyword"],
            [/->\s*\w*/, "type"],
            [/#\w+/, "annotation"],
            [/\{\s*\w+\s*\}/, "variable"],
          ],
        },
      });
      Monaco.languages.setLanguageConfiguration("terminal", {
        comments: { lineComment: "//" },
      });

      editor = Monaco.editor.create(divEl, {
        value: source,
        language: "terminal",
        theme: "vs-dark",
        minimap: { enabled: false },
        automaticLayout: true,
        renderWhitespace: "boundary",
      });
      editor.onDidChangeModelContent(() => {
        source = editor!.getValue();
      });
    });

    return () => {
      void ready.then(() => editor?.dispose());
    };
  });
</script>

<div class="split">
  <div class="pane">
    <div class="toolbar">
      <span class="name">story.term</span>
      <button onclick={restart}>restart preview</button>
    </div>
    <div bind:this={divEl} class="editor"></div>
    <ul class="errors" class:empty={errors.length === 0}>
      {#each errors as error}
        <li>
          <button onclick={() => goTo(error)}>
            line {error.line + 1}: {error.message}
          </button>
        </li>
      {/each}
    </ul>
  </div>

  <div class="pane preview">
    <Terminal {runner} />
  </div>
</div>

<style>
  .split {
    display: flex;
    flex-direction: row;
    height: 100vh;
    gap: 0.5rem;
  }
  .pane {
    flex: 1 1 50%;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .editor {
    flex: 1 1 auto;
    min-height: 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
  }
  .name {
    opacity: 0.6;
  }
  .errors {
    flex: 0 0 auto;
    max-height: 8rem;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.8rem;
  }
  .errors.empty {
    display: none;
  }
  .errors button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.15rem 0.5rem;
    border: 0;
    background: none;
    color: #ff6b6b;
    font: inherit;
    cursor: pointer;
  }
  .preview {
    overflow: hidden;
  }
</style>

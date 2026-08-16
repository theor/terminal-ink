<script lang="ts">
  import { onMount } from "svelte";
  import type monaco from "monaco-editor";
  import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

  import storySource from "../assets/story.lore?raw";
  import grimoireSource from "../assets/grimoire.lore?raw";
  import { blockAt, parse, type ParseError } from "./Parser.ts";
  import { Runner } from "./Runner.ts";
  import { TAGS } from "./tags.ts";
  import Terminal from "./Terminal.svelte";

  /** How long to wait after a keystroke before restarting the preview. */
  const RESTART_DELAY = 500;

  /** The tags that touch story state, as opposed to the display. */
  const STATE_TAGS = TAGS.filter((t) => t.apply || t.allows).map((t) => t.name);

  // $state so a loaded file can join the list and show up in the picker.
  let stories = $state<Record<string, string>>({
    "story.lore": storySource,
    "grimoire.lore": grimoireSource,
  });
  const initialSource = stories["story.lore"];

  let storyName = $state("story.lore");
  let source = $state(initialSource);
  let story = $derived(parse(source));
  let errors = $derived(story.errors);

  /**
   * Play mode: the terminal alone, filling the screen, with the editor
   * offstage. It is in the URL so the tablet at the table can be opened
   * straight into it, and the choice links only touch the hash.
   */
  let play = $state(new URLSearchParams(location.search).has("play"));

  /** Where the preview starts: the block the cursor is in, or the first one. */
  let followCursor = $state(true);
  let cursorLine = $state(0);
  // The name rather than the block, so moving the cursor *within* a block
  // leaves this unchanged and the preview is left alone.
  let startName = $derived(
    followCursor ? blockAt(story, cursorLine)?.name : undefined
  );

  // Replaced -- not mutated -- so the Terminal restarts on a fresh Runner.
  let runner = $state(new Runner(parse(initialSource)));

  let divEl: HTMLDivElement = $state(null!);
  let fileEl: HTMLInputElement = $state(null!);
  // $state so the marker effect below re-runs once Monaco has finished loading.
  let editor = $state<monaco.editor.IStandaloneCodeEditor | undefined>();
  let Monaco = $state<typeof monaco | undefined>();

  function restart() {
    runner = new Runner(story, startName);
  }

  function setPlay(on: boolean) {
    play = on;
    // Leaving play mode is the first moment an editor is needed, if the page
    // was opened straight into it.
    if (!on) void loadEditor();
    const url = new URL(location.href);
    url.search = on ? "play" : "";
    history.replaceState(null, "", url);
  }

  function loadStory(name: string) {
    storyName = name;
    source = stories[name];
    // Monaco holds its own copy of the text, so it has to be told.
    editor?.setValue(source);
  }

  function exportStory() {
    const url = URL.createObjectURL(new Blob([source], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = storyName;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importStory(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    // Cleared so picking the same file twice still fires a change event.
    e.currentTarget.value = "";
    if (!file) return;
    stories[file.name] = await file.text();
    loadStory(file.name);
  }

  let firstParse = true;
  $effect(() => {
    // Editing -- or moving the cursor into another block -- restarts the
    // preview once typing settles. The very first parse is already running, so
    // it is skipped.
    const current = story;
    const from = startName;
    if (firstParse) {
      firstParse = false;
      return;
    }
    const handle = setTimeout(() => {
      runner = new Runner(current, from);
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

  /** Set once the editor has been asked for; the load happens only once. */
  let loading: Promise<void> | undefined;

  /**
   * Monaco is by far the largest thing this app ships, and play mode never
   * puts it on screen -- so a tablet opened straight into `?play` should not
   * spend its first seconds downloading an editor nobody will look at.
   *
   * `editor.api` rather than `monaco-editor`: the latter contributes every
   * built-in language, none of which is this one.
   */
  function loadEditor(): Promise<void> {
    if (loading) return loading;

    // @ts-ignore -- Monaco reads this off the global.
    self.MonacoEnvironment = { getWorker: () => new editorWorker() };

    loading = import("monaco-editor/esm/vs/editor/editor.api").then((m) => {
      Monaco = m;
      Monaco.languages.register({ id: "terminal" });
      Monaco.languages.setMonarchTokensProvider("terminal", {
        tokenizer: {
          root: [
            // First, so an escaped sigil is not highlighted as the thing it
            // would otherwise open.
            [/\\[#{}=*\-/]/, "string.escape"],
            [/^\s*\/\/.*$/, "comment"],
            [/^\s*=\s*\w+/, "keyword"],
            [/^\s*\*/, "keyword"],
            // A tag that changes or reads story state reads as a keyword,
            // where the ones that only change the display do not. Built from
            // the registry, so a new one highlights without touching this file.
            [new RegExp(`#(${STATE_TAGS.join("|")})\\b`), "keyword"],
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
      editor.onDidChangeCursorPosition((e) => {
        // Monaco counts lines from 1, the parser from 0.
        cursorLine = e.position.lineNumber - 1;
      });
    });

    return loading;
  }

  onMount(() => {
    if (!play) void loadEditor();
    return () => {
      void loading?.then(() => editor?.dispose());
    };
  });
</script>

<div class="split">
  <!-- Kept on the page in play mode rather than unmounted, so Monaco holds its
       text, cursor and undo history -- and given a size, because it lays itself
       out against one. -->
  <div class="pane" class:offstage={play}>
    <div class="toolbar">
      <select
        aria-label="story"
        value={storyName}
        onchange={(e) => loadStory(e.currentTarget.value)}
      >
        {#each Object.keys(stories) as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
      <button onclick={restart}>restart preview</button>
      <label title="restart the preview at the block the cursor is in">
        <input type="checkbox" bind:checked={followCursor} />
        from {startName ?? "the top"}
      </label>
      <button onclick={() => setPlay(true)}>play</button>
      <button onclick={() => fileEl.click()}>load</button>
      <button onclick={exportStory}>export</button>
      <input
        bind:this={fileEl}
        type="file"
        accept=".lore"
        hidden
        onchange={importStory}
      />
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
    <Terminal {runner} fullscreen={play} />
  </div>
</div>

{#if play}
  <!-- Invisible until hovered, like the terminal's own full-screen toggle: the
       way out must be there without a control sitting on the screen the
       players are looking at. -->
  <button class="leave-play" title="edit" onclick={() => setPlay(false)}>e</button>
{/if}

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
    /* The page has no colour of its own; until now the toolbar held nothing
       but form controls, which bring theirs. */
    color: #ccc;
  }
  .toolbar label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
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

  /* Off the side of the window rather than `display: none`: Monaco lays itself
     out against the size it is given, and zero is not one. */
  .offstage {
    position: fixed;
    top: 0;
    left: -100vw;
    width: 50vw;
    height: 100vh;
  }

  .leave-play {
    position: fixed;
    top: 1rem;
    left: 1rem;
    width: 2rem;
    border: none;
    background-color: transparent;
    color: transparent;
    z-index: 1000;
  }
  .leave-play:hover {
    color: var(--term-color, #fff);
  }
</style>

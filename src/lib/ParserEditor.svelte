<script lang="ts">
  import { onMount } from "svelte";

  import storySource from "../assets/story.lore?raw";
  import grimoireSource from "../assets/grimoire.lore?raw";
  import { blockAt, isPrelude, parse, type ParseError } from "./Parser.ts";
  import { Runner } from "./Runner.ts";
  import type { LoreEditor } from "./loreEditor.ts";
  import Terminal from "./Terminal.svelte";

  /** How long to wait after a keystroke before restarting the preview. */
  const RESTART_DELAY = 500;

  // $state so a loaded file can join the list and show up in the picker.
  let stories = $state<Record<string, string>>({
    "story.lore": storySource,
    "grimoire.lore": grimoireSource,
  });
  const initialSource = stories["story.lore"];

  let storyName = $state("story.lore");
  let source = $state(initialSource);
  let story = $derived(parse(source));
  // One list, in source order: the author reads down it, and a warning about
  // a variable is as worth jumping to as a line that did not parse.
  let problems = $derived(
    [...story.errors, ...story.warnings].sort((a, b) => a.line - b.line)
  );

  /**
   * Play mode: the terminal alone, filling the screen, with the editor
   * offstage. It is in the URL so the tablet at the table can be opened
   * straight into it -- and so the two modes are two places, which is what
   * makes the back button mean something. Nothing else navigates: choices
   * cancel their own links precisely so that stays true.
   */
  // Reaching play mode from the editor leaves a story that is already running,
  // so only a page *opened* into it has a screen nobody has looked at yet --
  // and that one waits to be started rather than playing to an empty table.
  const openedInPlay = new URLSearchParams(location.search).has("play");
  let play = $state(openedInPlay);

  /**
   * Run the preview with no pacing at all: lines appear whole and `#delay` is
   * ignored. For checking a branch, not for reading the story as written, so
   * the switch sits with the editor -- but the setting itself carries into
   * play mode, where only the way out is on screen to undo it.
   */
  let fast = $state(false);

  /** Where the preview starts: the block the cursor is in, or the first one. */
  let followCursor = $state(true);
  let cursorLine = $state(0);
  // The name rather than the block, so moving the cursor *within* a block
  // leaves this unchanged and the preview is left alone.
  let cursorBlock = $derived(blockAt(story, cursorLine));
  // A prelude is not a screen, so a cursor parked in the declarations runs the
  // story from the top rather than naming a block that cannot be entered.
  let startName = $derived(
    followCursor && cursorBlock && !isPrelude(cursorBlock)
      ? cursorBlock.name
      : undefined
  );

  // Replaced -- not mutated -- so the Terminal restarts on a fresh Runner.
  let runner = $state(new Runner(parse(initialSource)));

  let divEl: HTMLDivElement = $state(null!);
  let fileEl: HTMLInputElement = $state(null!);
  // $state so the error effect below re-runs once the editor has loaded.
  let editor = $state<LoreEditor | undefined>();

  function restart() {
    runner = new Runner(story, startName);
  }

  /** Shows a mode without touching history; this is what the back button uses. */
  function showPlay(on: boolean) {
    play = on;
    // Leaving play mode is the first moment an editor is needed, if the page
    // was opened straight into it.
    if (!on) void loadEditor();
  }

  /**
   * Switching modes is a navigation, so it is pushed rather than replaced: the
   * back button is the way out of play mode that every tablet already has, and
   * a player who finds one has not lost the editor behind it.
   */
  function setPlay(on: boolean) {
    showPlay(on);
    const url = new URL(location.href);
    url.search = on ? "play" : "";
    history.pushState(null, "", url);
  }

  function loadStory(name: string) {
    storyName = name;
    source = stories[name];
    // The editor holds its own copy of the text, so it has to be told.
    editor?.setDoc(source);
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
    const current = problems;
    editor?.setErrors(current);
  });

  function goTo(error: ParseError) {
    editor?.goTo(error);
  }

  /** Set once the editor has been asked for; the load happens only once. */
  let loading: Promise<void> | undefined;

  /**
   * The editor is by far the largest thing this app ships, and play mode never
   * puts it on screen -- so a tablet opened straight into `?play` should not
   * spend its first seconds downloading an editor nobody will look at.
   */
  function loadEditor(): Promise<void> {
    if (loading) return loading;

    loading = import("./loreEditor.ts").then(({ createEditor }) => {
      editor = createEditor(divEl, {
        // Read now rather than captured earlier: a story may have been picked
        // while there was no editor to put it in.
        doc: source,
        onChange: (text) => (source = text),
        onCursorLine: (line) => (cursorLine = line),
      });
      editor.setErrors(problems);
    });

    return loading;
  }

  onMount(() => {
    if (!play) void loadEditor();
    // The URL is the mode, so going back to a URL is going back to a mode --
    // including forwards again into play.
    const onPopState = () =>
      showPlay(new URLSearchParams(location.search).has("play"));
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      void loading?.then(() => editor?.destroy());
    };
  });
</script>

<div class="split">
  <!-- Kept on the page in play mode rather than unmounted, so the editor holds
       its text, cursor and undo history -- and given a size, because it lays
       itself out against one. -->
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
      <label title="testing: type instantly and skip every #delay">
        <input type="checkbox" bind:checked={fast} />
        fast
      </label>
      <div class="rest">
        <button onclick={() => setPlay(true)}>play</button>
        <button onclick={() => fileEl.click()}>load</button>
        <button onclick={exportStory}>export</button>
      </div>
      <input
        bind:this={fileEl}
        type="file"
        accept=".lore"
        hidden
        onchange={importStory}
      />
    </div>
    <div bind:this={divEl} class="editor"></div>
    <ul class="errors" class:empty={problems.length === 0}>
      {#each problems as problem}
        <li>
          <button
            class:warning={problem.severity === "warning"}
            onclick={() => goTo(problem)}
          >
            line {problem.line + 1}: {problem.message}
          </button>
        </li>
      {/each}
    </ul>
  </div>

  <div class="pane preview">
    <Terminal {runner} fullscreen={play} {fast} manualStart={openedInPlay} />
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
  /* The toolbar is the one piece of the page that is not the story or the
     text of it, so it stays quiet: one strip, one weight of grey, and the
     accent only where something is on. */
  .toolbar {
    /* The green of the CRT, which is the only colour this app has. */
    --accent: #5bf870;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.5rem 0.6rem;
    font-family: inherit;
    font-size: 1.1rem;
    color: #ccc;
    background: #191919;
    border-bottom: 1px solid #2b2b2b;
  }
  .toolbar :is(button, select) {
    font: inherit;
    color: #ddd;
    padding: 0.3rem 0.7rem;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    background: #262626;
    cursor: pointer;
  }
  .toolbar :is(button, select):hover {
    background: #2f2f2f;
    border-color: #4c4c4c;
  }
  .toolbar button:active {
    background: #3a3a3a;
  }
  .toolbar :is(button, select, input):focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .toolbar label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
  }
  .toolbar label:hover {
    background: #232323;
  }
  /* On is worth seeing across the room; off is not. */
  .toolbar label:has(:checked) {
    color: var(--accent);
  }
  .toolbar input[type="checkbox"] {
    margin: 0;
    accent-color: var(--accent);
  }
  /* Everything after this sits at the right-hand end: what you do *to* the
     file, rather than what you are looking at. */
  .toolbar .rest {
    margin-left: auto;
    display: flex;
    gap: 0.4rem;
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
  /* A warning is not a broken line: the story runs exactly as written. */
  .errors button.warning {
    color: #d7ba7d;
  }
  .preview {
    overflow: hidden;
  }

  /* Off the side of the window rather than `display: none`: the editor lays
     itself out against the size it is given, and zero is not one. */
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

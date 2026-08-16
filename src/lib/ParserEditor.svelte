<script lang="ts">
  import { onMount } from "svelte";

  import storySource from "../assets/story.lore?raw";
  import grimoireSource from "../assets/grimoire.lore?raw";
  import { blockAt, parse, type ParseError } from "./Parser.ts";
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
  // $state so the error effect below re-runs once the editor has loaded.
  let editor = $state<LoreEditor | undefined>();

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
    const current = errors;
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
      editor.setErrors(errors);
    });

    return loading;
  }

  onMount(() => {
    if (!play) void loadEditor();
    return () => {
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

<script lang="ts">
  import { onMount, tick } from "svelte";

  import { blockAt, isPrelude, parse, type ParseError } from "./Parser.ts";
  import { Runner } from "./Runner.ts";
  import {
    addStory,
    canShare,
    load,
    save,
    shareLink,
    takeShared,
    type Stories,
  } from "./stories.ts";
  import type { LoreEditor } from "./loreEditor.ts";
  import Terminal from "./Terminal.svelte";

  /** How long to wait after a keystroke before restarting the preview. */
  const RESTART_DELAY = 500;

  // Whatever this browser was last looking at, or the stories that ship with
  // the app if it has never been here.
  const saved = load();

  // $state so a loaded file can join the list and show up in the picker.
  let stories = $state<Stories>(saved.stories);
  const initialSource = saved.stories[saved.selected];

  let storyName = $state(saved.selected);
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

  /**
   * Filling the screen is the browser's own, so the button is only worth
   * drawing where the browser will answer -- an iframe or a kiosk that has
   * turned it off would otherwise get a control that does nothing.
   */
  const fullscreenEnabled = document.fullscreenEnabled;

  /**
   * Read fresh on each press rather than tracked: the player can also leave
   * with Escape or F11, and nothing here would hear about it.
   */
  function toggleFullscreen() {
    // However the screen gets filled, the offer below has been answered.
    offerFullscreen = false;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }

  /**
   * The corner `f` is invisible until it is hovered, which is no way to find
   * out that filling the screen is an option at all -- so play mode says so
   * once, in a strip below the monitor, and then never again.
   *
   * Never again means this page load: the answer is held in memory and
   * nowhere else, so nothing is stored on the tablet and a refresh is a fresh
   * offer. Not $state, because it only decides whether the *next* arrival in
   * play mode offers anything.
   */
  let offered = false;
  let offerFullscreen = $state(false);

  $effect(() => {
    // Keyed on `play` rather than sat inside setPlay, because a page opened
    // straight into ?play never goes through it -- and that is the arrival
    // this is mostly for.
    if (!play || offered) return;
    offered = true;
    offerFullscreen = fullscreenEnabled && !document.fullscreenElement;
  });

  function loadStory(name: string) {
    storyName = name;
    source = stories[name];
    // A link belongs to the story it was made from, so it goes away with it.
    shareLinkText = "";
    shareStatus = "";
    // The editor holds its own copy of the text, so it has to be told.
    editor?.setDoc(source);
  }

  $effect(() => {
    // The pane is the story, so what is in it is what the list holds -- which
    // is what makes switching away and back again keep the typing rather than
    // reading the file as it was when it was opened.
    stories[storyName] = source;
  });

  $effect(() => {
    // Kept in the browser that wrote it, once the typing settles. A refresh,
    // a closed tab, a machine that slept at the table: none of them should
    // cost an evening's writing.
    const snapshot = { ...stories };
    const name = storyName;
    const handle = setTimeout(() => save(snapshot, name), RESTART_DELAY);
    return () => clearTimeout(handle);
  });

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
    loadStory(addStory(stories, file.name, await file.text()));
  }

  /**
   * Sharing is a button, not something the address bar does while you type.
   * The URL here means which mode you are in -- that is what makes the back
   * button the way out of play mode -- and a story written into it on every
   * keystroke would drown that in a thousand entries nobody wants to walk
   * back through.
   */
  let shareStatus = $state("");
  /** Only set when the clipboard would not take the link; see below. */
  let shareLinkText = $state("");
  /**
   * Something wrong with a link that *arrived*, as against feedback on a
   * button that was pressed -- and so the one message here that play mode has
   * to be able to say. A link cut short by whatever carried it leaves the
   * story that was already on the device running, which looks exactly like
   * success from across a table; the toolbar that would otherwise carry the
   * news is off the side of the window in that mode.
   */
  let arrivalProblem = $state("");
  let linkEl = $state<HTMLInputElement>();

  /** Past which a link is worth a word of warning rather than a refusal. */
  const LONG_LINK = 8000;

  async function shareStory() {
    shareStatus = "";
    shareLinkText = "";

    let link: string;
    try {
      link = await shareLink(storyName, source);
    } catch {
      shareStatus = "the link could not be made";
      return;
    }
    const long = link.length > LONG_LINK;

    try {
      await navigator.clipboard.writeText(link);
      shareStatus = long
        ? "link copied -- a long one; some apps will cut it"
        : "link copied";
    } catch {
      // The dev server on the table's own network is plain http, where a
      // browser will not hand out the clipboard at all -- and that is the way
      // this app is mostly run. So the link goes on the screen instead,
      // selected, and copying it is the browser's ordinary business.
      shareLinkText = link;
      shareStatus = long ? "a long one; some apps will cut it" : "";
      await tick();
      linkEl?.select();
    }
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

  /**
   * A link is an import, not a takeover: the story it carries lands in the
   * list beside whatever this browser already had and gets selected, the same
   * way a file does. Nothing that was here is written over, so a link opened
   * on the machine the stories live on costs nothing.
   */
  function receiveShared() {
    void takeShared()
      .then((shared) => {
        if (!shared) return;
        arrivalProblem = "";
        loadStory(addStory(stories, shared.name, shared.source));
      })
      .catch(
        () =>
          (arrivalProblem =
            "that link could not be read -- this is not the story it was meant to open")
      );
  }

  onMount(() => {
    if (!play) void loadEditor();
    receiveShared();
    // A link pasted into a tab that already has this page open changes the
    // fragment and nothing else: no load, so nothing on the way in would
    // hear about it and the story would sit unread in the address bar. The
    // one that arrives that way is as much an arrival as the one that came
    // with the page. Clearing the fragment afterwards is a replace, which
    // fires none of this again.
    window.addEventListener("hashchange", receiveShared);
    // The URL is the mode, so going back to a URL is going back to a mode --
    // including forwards again into play.
    const onPopState = () =>
      showPlay(new URLSearchParams(location.search).has("play"));
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("hashchange", receiveShared);
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
        {#if shareLinkText}
          <!-- Only here because the clipboard would not take it: a link on a
               plain-http dev server has to be copied by hand. -->
          <input
            bind:this={linkEl}
            class="link"
            readonly
            value={shareLinkText}
            aria-label="link to this story"
            onfocus={(e) => e.currentTarget.select()}
          />
        {/if}
        {#if shareStatus}
          <span class="status">{shareStatus}</span>
        {/if}
        {#if arrivalProblem}
          <span class="status problem">{arrivalProblem}</span>
        {/if}
        <button onclick={() => setPlay(true)}>play</button>
        <button onclick={() => fileEl.click()}>load</button>
        <button onclick={exportStory}>export</button>
        {#if canShare}
          <button
            onclick={shareStory}
            title="a link carrying this story as it is now">share</button
          >
        {/if}
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
  {#if arrivalProblem}
    <!-- The one piece of news play mode cannot afford to lose. The toolbar is
         off the side of the window here, so without this a tablet opened on a
         link that arrived cut short would sit on the table looking like it had
         worked, running whatever story was on it before. Above the monitor
         rather than below it, where the fullscreen offer already sits, and it
         goes away when it has been read. -->
    <button class="notice" title="dismiss" onclick={() => (arrivalProblem = "")}
      >{arrivalProblem}</button
    >
  {/if}
  <!-- The two things play mode can do, one in each top corner and both
       invisible until hovered: the way out, and the way to fill the screen.
       They have to be reachable without a control sitting on the screen the
       players are looking at. Neither exists in the editor, where the toolbar
       is already the way in and the window is already the size it is. -->
  <button class="corner leave" title="edit" onclick={() => setPlay(false)}>e</button>
  {#if fullscreenEnabled}
    <button class="corner fill" title="fullscreen" onclick={toggleFullscreen}
      >f</button
    >
  {/if}
  {#if offerFullscreen}
    <!-- Under the monitor rather than over it: the case has room around it in
         play mode, and an offer that covers the story it is offering to
         improve has already failed. -->
    <div class="offer">
      <span>the story reads better with the screen to itself</span>
      <button class="go" onclick={toggleFullscreen}>fullscreen</button>
      <button onclick={() => (offerFullscreen = false)}>not now</button>
    </div>
  {/if}
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
    align-items: center;
    gap: 0.4rem;
  }
  /* Long by nature and never read, only copied -- so it is given a width it
     can be dragged across rather than one that fits what is in it. */
  .toolbar .link {
    width: 16rem;
    font: inherit;
    font-size: 0.8rem;
    color: #999;
    padding: 0.3rem 0.5rem;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    background: #101010;
  }
  /* A word about what just happened, in the grey of everything that is not
     the story. */
  .toolbar .status {
    font-size: 0.8rem;
    color: #999;
  }
  /* A story that did not arrive is the same order of thing as a line that did
     not parse, so it is the same red. */
  .toolbar .status.problem {
    color: #ff6b6b;
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

  /* Both play-mode controls: a letter in a corner that is not drawn until it
     is wanted. Transparent rather than hidden, so the space it occupies is
     the same before and after -- and it stays clickable, which is what makes
     hovering the corner enough to find it. */
  .corner {
    position: fixed;
    top: 1rem;
    width: 2rem;
    border: none;
    background-color: transparent;
    color: transparent;
    z-index: 1000;
  }
  .corner:is(:hover, :focus-visible) {
    color: var(--term-color, #fff);
  }
  .leave {
    left: 1rem;
  }
  .fill {
    right: 1rem;
  }

  /* Play mode's bad news: the offer's strip, at the top of the surround
     rather than the bottom so the two never sit on each other, and in the red
     the editor uses for a story that did not come out right. */
  .notice {
    position: fixed;
    top: 0.6rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    max-width: calc(100vw - 6rem);
    padding: 0.35rem 0.8rem;
    border: 1px solid #4a2020;
    border-radius: 999px;
    background: #191919;
    color: #ff6b6b;
    font: inherit;
    font-size: 0.85rem;
    text-align: center;
    cursor: pointer;
  }

  /* The one thing in play mode that is drawn without being asked for, so it
     is drawn quietly: the toolbar's greys, at the bottom of the surround,
     narrow enough to sit in it. */
  .offer {
    position: fixed;
    bottom: 0.6rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: calc(100vw - 2rem);
    padding: 0.35rem 0.35rem 0.35rem 0.8rem;
    border: 1px solid #2b2b2b;
    border-radius: 999px;
    background: #191919;
    color: #999;
    font-size: 0.85rem;
  }
  .offer button {
    font: inherit;
    padding: 0.25rem 0.7rem;
    border: 1px solid #3a3a3a;
    border-radius: 999px;
    background: #262626;
    color: #ddd;
    cursor: pointer;
  }
  /* The green of the CRT, on the one control the offer is actually for. */
  .offer button.go {
    border-color: #5bf870;
    color: #5bf870;
  }
  .offer button:hover {
    background: #2f2f2f;
  }
  .offer button:focus-visible {
    outline: 2px solid #5bf870;
    outline-offset: 1px;
  }
</style>

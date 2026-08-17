<script lang="ts">
  import { untrack } from "svelte";
  import { typewriter } from "./TypingEffect.ts";
  import type { Runner, RunChoice, StepResult } from "./Runner.ts";
  import type { Tag } from "./Parser.ts";
  import { tagSpec, tagValues, type TerminalUI } from "./tags.ts";
  import { DEFAULT_THEME, themeFor } from "./themes/index.ts";

  let {
    runner,
    /** Cover the whole viewport (play mode) rather than sit inside a pane. */
    fullscreen = false,
    /**
     * Skip every pause the story asks for -- typing and `#delay` alike -- so an
     * author checking a branch does not sit through its pacing. A testing
     * control: nothing in a story can turn it on.
     */
    fast = false,
    /**
     * Wait for the player before running anything. A tablet opened straight
     * into play mode sits on the table long before anyone is looking at it,
     * and a story that boots to an empty screen has already been missed.
     */
    manualStart = false,
  }: {
    runner: Runner;
    fullscreen?: boolean;
    fast?: boolean;
    manualStart?: boolean;
  } = $props();

  interface Line {
    id: number;
    text: string;
    title: boolean;
    /** Captured when the line is printed, so a later #speed cannot retype it. */
    speed: number;
  }

  const DEFAULT_SPEED = 5;

  let lines = $state<Line[]>([]);
  let choices = $state<RunChoice[]>([]);
  /** The keyboard's cursor into `choices`; Enter takes whatever it sits on. */
  let selected = $state(0);
  let halted = $state(false);
  let password = $state<string | null>(null);
  let themeName = $state(DEFAULT_THEME);
  let speed = DEFAULT_SPEED;
  let nextId = 0;

  const theme = $derived(themeFor(themeName));
  const Chrome = $derived(theme.chrome);

  /**
   * Bumped on every restart. A drain loop that finds the generation has moved
   * on abandons itself, so a story swapped in mid-typing does not interleave.
   */
  let generation = 0;
  let doneTyping: (() => void) | null = null;

  /** Nothing has run yet and the player has not asked for it to. */
  let awaitingStart = $state(false);
  // Not $state: it only decides what the *next* restart does, and the wait is
  // asked for once -- an author who has left play mode and is editing should
  // not have to press start after every keystroke.
  let started = false;

  $effect(() => {
    // Re-runs whenever the parent hands over a new Runner -- and only then.
    // Everything below both reads and writes the display state, so it has to
    // stay untracked or the effect would keep invalidating itself.
    const r = runner;
    untrack(() => {
      generation += 1;
      lines = [];
      choices = [];
      selected = 0;
      halted = false;
      password = null;
      themeName = DEFAULT_THEME;
      speed = DEFAULT_SPEED;
      doneTyping = null;
      if (manualStart && !started) {
        awaitingStart = true;
        return;
      }
      awaitingStart = false;
      void drain(generation, r.start());
    });
  });

  function begin() {
    awaitingStart = false;
    started = true;
    void drain(generation, runner.start());
  }

  function typed(): Promise<void> {
    return new Promise((resolve) => (doneTyping = resolve));
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Whether the line about to be printed was marked as a heading. */
  let heading = false;

  /**
   * What a tag is allowed to do to the display. The tags themselves live in
   * tags.ts -- this is only the set of levers they can pull, so a new display
   * tag is an entry there rather than another branch in the loop below.
   */
  const ui: TerminalUI = {
    clear: () => (lines = []),
    setSpeed: (ms) => (speed = ms),
    // A theme change is handled here rather than in the runner: it changes how
    // the story looks, not what it does.
    setTheme: (name) => (themeName = name),
    asHeading: () => (heading = true),
    wait: (ms) => (fast ? Promise.resolve() : wait(ms)),
  };

  /** Runs one phase of whatever the tags on a line do to the display. */
  async function runView(tags: Tag[], phase: "before" | "after") {
    for (const tag of tags) {
      const spec = tagSpec(tag.name);
      if (spec?.view?.phase !== phase) continue;
      const values = spec.bind(tag.args);
      if (values) await spec.view.run(ui, values);
    }
  }

  /** Prints a step's outputs in order, then offers whatever comes next. */
  async function drain(gen: number, step: StepResult) {
    for (const output of step.outputs) {
      if (gen !== generation) return;

      heading = false;
      await runView(output.tags, "before");
      if (gen !== generation) return;

      if (output.text !== null) {
        lines = [
          ...lines,
          {
            id: nextId++,
            text: heading ? theme.strings.title(output.text) : output.text,
            title: heading,
            speed: fast ? 0 : speed,
          },
        ];
        await typed();
        if (gen !== generation) return;
      }

      await runView(output.tags, "after");
      if (gen !== generation) return;
    }

    halted = step.halted;
    if (step.pause?.tag.name === "password") {
      // Through the registry rather than off the raw arguments, so a quoted
      // password is the words rather than the words with quotes around them.
      const values = tagValues(step.pause.tag.name, step.pause.tag.args);
      password = (values as string[] | null)?.[0] ?? "";
    } else {
      choices = step.choices;
      selected = 0;
    }
  }

  function choose(index: number) {
    if (password !== null || index >= choices.length) return;
    const gen = generation;
    choices = [];
    void drain(gen, runner.select(index));
  }

  /**
   * Takes the keyboard the moment the prompt appears. A password is the one
   * point where the story wants typing rather than a choice, and a player who
   * has to find and click the line first has already typed into nothing.
   */
  function focusOnShow(node: HTMLElement) {
    node.focus();
  }

  function onPasswordKey(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const node = e.currentTarget as HTMLElement;
    const entered = (node.textContent ?? "").trim();
    node.textContent = "";

    if (entered.toLowerCase() !== (password ?? "").toLowerCase()) {
      lines = [
        ...lines,
        {
          id: nextId++,
          text: theme.strings.wrongPassword,
          title: false,
          speed: fast ? 0 : speed,
        },
      ];
      return;
    }
    const gen = generation;
    password = null;
    void drain(gen, runner.resume(true));
  }

  /**
   * The keyboard drives the story: a number takes that choice outright, the
   * arrows move the cursor and Enter takes what it sits on.
   *
   * It listens on the window rather than on the terminal, so a player never
   * has to click the screen before it answers -- and steps aside for anything
   * editable, which is what stops a `2` typed in the editor next door from
   * also picking the second choice.
   *
   * It steps aside for a focused control for the same reason: Enter on the
   * fullscreen button is meant for the button, and taking it here would start
   * the story (or pick a choice) instead of pressing what the player is
   * looking at. The choices themselves are anchors, so they keep their own
   * Enter handling below.
   */
  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        'input, textarea, [contenteditable="true"], button, select'
      )
    )
      return;

    if (awaitingStart) {
      // Any key a player would press to say "go", which is any key that types
      // something plus Enter -- but not Tab, which is how they got here.
      if (e.key.length === 1 || e.key === "Enter") {
        e.preventDefault();
        begin();
      }
      return;
    }
    // The password prompt is contenteditable, so it is already covered above;
    // this is for the story having moved on while focus sat elsewhere.
    if (password !== null || choices.length === 0) return;

    if (e.key >= "1" && e.key <= "9") {
      const index = Number(e.key) - 1;
      if (index >= choices.length) return;
      e.preventDefault();
      choose(index);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : choices.length - 1;
      selected = (selected + step) % choices.length;
    } else if (e.key === "Enter") {
      // Cancels the anchor's own activation as well: a focused choice is taken
      // here, rather than here and again by the click the browser would send.
      e.preventDefault();
      choose(selected);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<Chrome {fullscreen}>
  <div class="content">
    {#if awaitingStart}
      <button class="start" onclick={begin}>{theme.strings.start}</button>
    {:else}
      {#each lines as line (line.id)}
        {#if line.title}
          <!-- svelte-ignore a11y_missing_content -- the typewriter action fills it -->
          <h3
            use:typewriter={{
              text: line.text,
              speed: line.speed,
              ondone: () => doneTyping?.(),
            }}
          ></h3>
        {:else}
          <p
            use:typewriter={{
              text: line.text,
              speed: line.speed,
              ondone: () => doneTyping?.(),
            }}
          ></p>
        {/if}
      {/each}

      {#if password !== null}
        <div
          class="prompt"
          inputmode={theme.passwordInputMode}
          contenteditable="true"
          tabindex="0"
          role="textbox"
          spellcheck="false"
          onkeydown={onPasswordKey}
          use:focusOnShow
        ></div>
      {:else if halted && choices.length === 0}
        <p class="halted">{theme.strings.end}</p>
      {:else}
        <ol>
          {#each choices as choice, i (choice.index)}
            <li>
              <a
                href="#/"
                role="button"
                class:selected={i === selected}
                tabindex={i + 1}
                onfocus={() => (selected = i)}
                onclick={(e) => {
                  // A choice is a move in the story, not a place to come back
                  // to: without this the href leaves a history entry and the
                  // back button spends one press on it before leaving play.
                  e.preventDefault();
                  choose(i);
                }}>{choice.label}</a
              >
            </li>
          {/each}
        </ol>
      {/if}
    {/if}
  </div>
</Chrome>

<style>
  /* Everything here is written against the theme's custom properties. A theme
     that wants something the properties cannot express styles it from its own
     chrome instead. */
  .content {
    position: relative;
    height: 100%;
    padding: var(--term-padding, 2rem);
    overflow-y: auto;
    overflow-x: hidden;
    word-break: break-word;
    color: var(--term-color);
    font-family: var(--term-font);
    /* Pinned rather than left at `normal`: the caret below is sized against it,
       and `normal` is whatever metrics the font that actually loaded happens to
       have -- which is not the same on a machine that fell back to a system
       font as on one that got the woff2. */
    line-height: var(--term-line-height, 1.1);
    text-transform: var(--term-transform, none);
    text-shadow: var(--term-text-shadow, none);
    animation: var(--term-text-anim, none);
  }
  .content :is(p, h3, ol, li, a) {
    color: inherit;
    margin: 0;
  }

  .content ol {
    padding-left: 0;
    list-style: var(--term-choice-list, none);
  }
  .content li {
    padding-left: 0;
  }
  .content a::before {
    content: var(--term-choice-marker, "");
  }
  /* `.selected` is the keyboard's cursor and `:focus` is the browser's; they
     are drawn the same because they mean the same thing -- and they are kept
     on the same choice, so only ever one mark is on screen. */
  .content a:is(:focus, .selected)::before {
    content: var(--term-focus-open, "");
  }
  .content a:is(:focus, .selected)::after {
    content: var(--term-focus-close, "");
  }

  /* The story has not started. Styled as a line of the terminal rather than as
     a button, because that is what it is standing in for. */
  .start {
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-transform: inherit;
    cursor: pointer;
  }

  .halted {
    opacity: 0.6;
  }

  .prompt {
    display: flex;
    flex-shrink: 1;
    border: none;
    background: transparent;
    caret-color: transparent;
    font-family: var(--term-font);
    font-size: inherit;
    text-transform: var(--term-transform, none);
    animation: var(--term-text-anim, none);
    field-sizing: content;
  }
  .prompt:focus {
    outline: none;
  }
  .prompt::before {
    content: var(--term-prompt-marker, "> ");
  }
  /* The caret, in both places it appears: at the end of the line being typed
     and at the prompt. Sized in `em`/`ch` so it stays the same size *relative
     to the text* on every screen, and sat on the bottom of the line box rather
     than on the baseline -- so as long as it is no taller than the line-height
     above, it cannot grow the line it sits on. That is the whole rule: keep
     --term-cursor-h under --term-line-height. Aligning to the baseline put its
     full height above the baseline and made every line taller while it was
     being typed than once it was done; aligning to `text-bottom` instead reads
     the font's own metrics, and IM Fell's descent hangs below the line box.

     .typewriter is added by the action at runtime, so it has to be :global --
     scoped under .content it still cannot leak out of the terminal. */
  .prompt:focus::after,
  .content :global(.typewriter)::after {
    content: " ";
    display: inline-block;
    width: var(--term-cursor-w, 0.5em);
    height: var(--term-cursor-h, 1em);
    vertical-align: bottom;
    background: var(--term-color);
  }
  .prompt:focus::after {
    /* The prompt is a flex row, so its caret is a flex item rather than part of
       a line box: it holds its own width open, and only it blinks -- a caret
       running ahead of the text as it types does not need announcing. */
    flex: 0 0 var(--term-cursor-w, 0.5em);
    animation: var(--term-cursor-anim);
  }


  .content ::selection {
    background: var(--term-color);
    color: var(--term-bg);
    text-shadow: none;
  }
</style>

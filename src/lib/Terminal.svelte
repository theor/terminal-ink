<script lang="ts">
  import { untrack } from "svelte";
  import { typewriter } from "./TypingEffect.ts";
  import type { Runner, RunChoice, StepResult } from "./Runner.ts";
  import type { Tag } from "./Parser.ts";
  import { tagSpec, type TerminalUI } from "./tags.ts";
  import { DEFAULT_THEME, themeFor } from "./themes/index.ts";

  let {
    runner,
    /** Cover the whole viewport (play mode) rather than sit inside a pane. */
    fullscreen = false,
  }: { runner: Runner; fullscreen?: boolean } = $props();

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

  $effect(() => {
    // Re-runs whenever the parent hands over a new Runner -- and only then.
    // Everything below both reads and writes the display state, so it has to
    // stay untracked or the effect would keep invalidating itself.
    const r = runner;
    untrack(() => {
      generation += 1;
      lines = [];
      choices = [];
      halted = false;
      password = null;
      themeName = DEFAULT_THEME;
      speed = DEFAULT_SPEED;
      doneTyping = null;
      void drain(generation, r.start());
    });
  });

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
    wait,
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
            speed,
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
      password = step.pause.tag.args[0] ?? "";
    } else {
      choices = step.choices;
    }
  }

  function choose(index: number) {
    if (password !== null) return;
    const gen = generation;
    choices = [];
    void drain(gen, runner.select(index));
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
        { id: nextId++, text: theme.strings.wrongPassword, title: false, speed },
      ];
      return;
    }
    const gen = generation;
    password = null;
    void drain(gen, runner.resume(true));
  }

  function onChoiceKey(index: number) {
    return (e: KeyboardEvent) => {
      if (e.key === "Enter") choose(index);
    };
  }

  function toggleFullScreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }
</script>

<Chrome {fullscreen}>
  <div class="content">
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
              tabindex={i + 1}
              onkeydown={onChoiceKey(i)}
              onclick={() => choose(i)}>{choice.label}</a
            >
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</Chrome>

<button class="toggle-fullscreen" onclick={toggleFullScreen}>f</button>

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
  .content a:focus::before {
    content: var(--term-focus-open, "");
  }
  .content a:focus::after {
    content: var(--term-focus-close, "");
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
  .prompt:focus::after {
    content: " ";
    display: inline-block;
    width: var(--term-cursor-w, 1em);
    height: var(--term-cursor-h, 1em);
    background: var(--term-color);
    animation: var(--term-cursor-anim);
  }

  /* .typewriter is added by the action at runtime, so it has to be :global --
     scoped under .content it still cannot leak out of the terminal. */
  .content :global(.typewriter)::after {
    content: " ";
    display: inline-block;
    width: var(--term-cursor-w, 1rem);
    height: var(--term-cursor-h, 1rem);
    background: var(--term-color);
  }

  .content ::selection {
    background: var(--term-color);
    color: var(--term-bg);
    text-shadow: none;
  }

  .toggle-fullscreen {
    position: fixed;
    top: 1rem;
    right: 1rem;
    width: 2rem;
    border: none;
    background-color: transparent;
    color: transparent;
    z-index: 1000;
  }
  .toggle-fullscreen:hover {
    color: var(--term-color, #fff);
  }
</style>

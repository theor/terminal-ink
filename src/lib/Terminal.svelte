<script lang="ts">
  import { untrack } from "svelte";
  import { typewriter } from "./TypingEffect.ts";
  import type { Runner, Output, RunChoice, StepResult } from "./Runner.ts";

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
  let speed = DEFAULT_SPEED;
  let nextId = 0;

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

  function tagArg(output: Output, name: string): string | undefined {
    return output.tags.find((t) => t.name === name)?.args[0];
  }

  /** Prints a step's outputs in order, then offers whatever comes next. */
  async function drain(gen: number, step: StepResult) {
    for (const output of step.outputs) {
      if (gen !== generation) return;

      const nextSpeed = tagArg(output, "speed");
      if (nextSpeed) speed = parseInt(nextSpeed);
      if (output.tags.some((t) => t.name === "clear")) lines = [];

      if (output.text !== null) {
        lines = [
          ...lines,
          {
            id: nextId++,
            text: output.text,
            title: output.tags.some((t) => t.name === "title"),
            speed,
          },
        ];
        await typed();
        if (gen !== generation) return;
      }

      if (output.tags.some((t) => t.name === "delay")) {
        await wait(parseInt(tagArg(output, "delay") ?? "1500"));
        if (gen !== generation) return;
      }
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
        { id: nextId++, text: "ACCESS DENIED", title: false, speed },
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

<div class="theme-green" class:fullscreen class:contained={!fullscreen}>
  <div id="monitor" class="on">
    <div id="screen">
      <div id="crt">
        <div class="scanline"></div>
        <div class="terminal">
          {#each lines as line (line.id)}
            {#if line.title}
              <h3 use:typewriter={{ text: `// ${line.text} //`, speed: line.speed, ondone: () => doneTyping?.() }}></h3>
            {:else}
              <p use:typewriter={{ text: line.text, speed: line.speed, ondone: () => doneTyping?.() }}></p>
            {/if}
          {/each}

          {#if password !== null}
            <div
              class="prompt"
              inputmode="numeric"
              contenteditable="true"
              tabindex="0"
              role="textbox"
              spellcheck="false"
              onkeydown={onPasswordKey}
            ></div>
          {:else if halted && choices.length === 0}
            <p class="halted">-- END OF LINE --</p>
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
        <button id="toggleFullscreen" onclick={toggleFullScreen}>f</button>
      </div>
    </div>
  </div>
</div>

<style>
  .halted {
    opacity: 0.6;
  }

  /* app.css sizes the terminal by pinning #crt to the viewport, which only
     works when it owns the page. Inside the editor's preview pane it has to be
     given a box of its own instead. */
  .contained {
    height: 100%;
    display: flex;
    overflow: auto;
    container-type: inline-size;
  }
  .contained #monitor {
    margin: auto;
    padding: 2cqw;
  }
  .contained #screen {
    height: 45cqw;
  }
  /* app.css sizes the type off the viewport (8.2vmin), which is far too big
     for half a window. In the pane it scales off the pane instead, tuned so
     the 80-column screen just fits. */
  .contained #crt {
    height: 100%;
    font-size: 2.8cqw;
  }
</style>

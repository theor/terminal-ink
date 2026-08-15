<script lang="ts">
  import type { ChromeProps } from "./types.ts";

  let { fullscreen = false, children }: ChromeProps = $props();
</script>

<div class="library-theme" class:fullscreen class:contained={!fullscreen}>
  <div class="desk">
    <div class="book">
      <div class="page">
        <div class="candle"></div>
        {@render children()}
      </div>
    </div>
  </div>
</div>

<style>
  .library-theme {
    --term-color: #3a2a18;
    --term-bg: #e6d7b8;
    --term-font: "IM Fell English", Georgia, "Times New Roman", serif;
    --term-transform: none;
    --term-padding: 2.2rem 2.6rem;
    /* Ink sinks into the paper instead of glowing off a phosphor. */
    --term-text-anim: none;
    --term-text-shadow: 0 0 1px rgba(58, 42, 24, 0.45);
    --term-choice-list: none;
    --term-choice-marker: "\2767  ";
    --term-focus-open: "\2767  ";
    --term-focus-close: "";
    --term-prompt-marker: "\2014  ";
    --term-cursor-w: 0.09em;
    --term-cursor-h: 1em;
    --term-cursor-anim: quill 1.4s ease-in-out infinite;
  }

  .fullscreen {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .contained {
    height: 100%;
    display: flex;
    overflow: auto;
    container-type: inline-size;
  }

  /* Dark wood, lit from above by the candle. */
  .desk {
    margin: 3vmin auto;
    padding: 5vmin;
    width: min-content;
    display: flex;
    background: radial-gradient(ellipse at 50% 15%, #2c1e13 0%, #120b06 70%);
    border-radius: 0.5rem;
  }
  .contained .desk {
    margin: auto;
    padding: 2cqw;
  }

  /* Tooled leather binding. */
  .book {
    padding: 1.6rem;
    border-radius: 0.35rem 0.9rem 0.9rem 0.35rem;
    background: linear-gradient(155deg, #6b452a 0%, #4a2d19 45%, #2a180d 100%);
    box-shadow:
      inset 0 0 0 2px rgba(214, 176, 106, 0.35),
      inset 0 0 0 6px rgba(0, 0, 0, 0.35),
      0 1.5rem 3rem rgba(0, 0, 0, 0.55);
  }
  .contained .book {
    padding: 1.4cqw;
  }

  .page {
    /* The font must live here, not just on the content: `ch` is measured
       against this element's font, and the min-width below is in ch. */
    font-family: var(--term-font);
    position: relative;
    overflow: hidden;
    min-width: 62ch; /* a page is narrower than a terminal */
    height: 100%;
    font-size: max(3vh, 7.4vmin);
    background: var(--term-bg);
    background-image: radial-gradient(
      ellipse at 50% 38%,
      rgba(255, 246, 220, 0.95) 0%,
      rgba(219, 199, 162, 0.9) 62%,
      rgba(150, 124, 86, 0.92) 100%
    );
    box-shadow:
      inset 0 0 4rem rgba(90, 60, 25, 0.45),
      inset 0 0 0 1px rgba(90, 60, 25, 0.25);
  }
  .contained .page {
    font-size: 2.9cqw;
    height: 45cqw;
  }
  .fullscreen .page {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 999;
  }

  /* Laid-paper grain: fine chain lines, no asset needed. */
  .page::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background-image:
      repeating-linear-gradient(
        0deg,
        rgba(120, 90, 50, 0.035) 0 1px,
        transparent 1px 3px
      ),
      repeating-linear-gradient(
        90deg,
        rgba(120, 90, 50, 0.03) 0 1px,
        transparent 1px 4px
      );
  }

  /* Warm light from off the top of the page, guttering. */
  .candle {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    mix-blend-mode: multiply;
    background: radial-gradient(
      ellipse at 50% -5%,
      rgba(255, 255, 255, 0) 0%,
      rgba(196, 156, 96, 0.16) 55%,
      rgba(90, 60, 25, 0.42) 100%
    );
    animation: candle 6s ease-in-out infinite;
  }

  /* Content refinements. The shared markup lives in Terminal; a theme reaches
     into it only through its own root, never globally. */
  .library-theme :global(h3) {
    font-variant: small-caps;
    letter-spacing: 0.06em;
    border-bottom: 1px solid rgba(58, 42, 24, 0.35);
    padding-bottom: 0.1em;
    margin-bottom: 0.35em !important;
  }
  .library-theme :global(a) {
    text-decoration: none;
  }
  .library-theme :global(a:focus) {
    background: rgba(58, 42, 24, 0.12);
  }
</style>

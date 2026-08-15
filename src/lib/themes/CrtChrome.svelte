<script lang="ts">
  import type { ChromeProps } from "./types.ts";

  let { fullscreen = false, children }: ChromeProps = $props();
</script>

<div class="crt-theme" class:fullscreen class:contained={!fullscreen}>
  <div class="monitor">
    <div class="screen">
      <div class="tube">
        <div class="scanline"></div>
        <div class="flicker"></div>
        {@render children()}
      </div>
    </div>
  </div>
</div>

<style>
  .crt-theme {
    --term-color: #5bf870;
    --term-bg: #05321e;
    --term-off: #050505;
    --term-font: "VT323", monospace;
    --term-transform: uppercase;
    --term-padding: 2rem;
    /* The aberration is the CRT's text treatment; other themes set none. */
    --term-text-anim: textShadow 1.6s infinite;
    --term-text-shadow: none;
    --term-choice-list: inside decimal;
    --term-choice-marker: "";
    --term-focus-open: "[";
    --term-focus-close: "]";
    --term-prompt-marker: "> ";
    --term-cursor-w: 1rem;
    --term-cursor-h: 1rem;
    --term-cursor-anim: cursor 1s infinite;
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
    /* Sizing off the pane rather than the viewport, so the 80-column screen
       still fits when the terminal is only half the window. */
    container-type: inline-size;
  }

  .monitor {
    margin: 3vmin auto;
    padding: 5.5vmin;
    width: min-content;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #3f3933;
    border-radius: 0.5rem;
    box-shadow: 0.6px 90px 110px -60px var(--term-bg); /* screen glow */
  }
  .contained .monitor {
    margin: auto;
    padding: 2cqw;
  }

  /* The bezel. This used to be a border-image pointing at an asset that was
     never in the repo, so it rendered as a transparent 30px gap. */
  .screen {
    position: relative;
    overflow: hidden;
    padding: 1.8rem;
    border-radius: 1.2rem;
    background: linear-gradient(155deg, #554d45 0%, #322c27 45%, #1d1917 100%);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.08),
      0 0 0 1px #15120f;
  }
  .contained .screen {
    padding: 1.5cqw;
  }

  .tube {
    /* The font must live here, not just on the content: `ch` is measured
       against this element's font, and the min-width below is in ch. */
    font-family: var(--term-font);
    position: relative;
    overflow: hidden;
    min-width: 80ch; /* This makes 80 monospace characters fit on the screen */
    height: 100%;
    font-size: max(3vh, 8.2vmin);
    border-radius: 0.4rem;
    background: var(--term-bg);
    background-image: radial-gradient(
      ellipse,
      var(--term-bg) 0%,
      var(--term-off) 90%
    );
    transition: all 0.5s;
  }
  .contained .tube {
    font-size: 2.8cqw;
    height: 45cqw;
  }
  .fullscreen .tube {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 999;
  }

  /* Horizontal scan lines. */
  .tube::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(18, 16, 16, 0.1) 50%,
      rgba(0, 0, 0, 0.25) 50%
    );
    background-size: 100% 8px;
    z-index: 2;
    pointer-events: none;
    animation: fadeIn 2s;
  }

  /* Unsteady brightness. This was position:fixed and tinted the whole window,
     editor included; it belongs to the tube. */
  .flicker {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    background: rgba(18, 16, 16, 0.2);
    animation: flicker 0.1s infinite;
  }

  /* Bright band sweeping top to bottom. */
  .scanline {
    position: absolute;
    bottom: 100%;
    width: 100%;
    height: 100px;
    z-index: 8;
    opacity: 0.1;
    pointer-events: none;
    background: linear-gradient(
      0deg,
      rgba(0, 0, 0, 0) 0%,
      rgba(255, 255, 255, 0.2) 10%,
      rgba(0, 0, 0, 0.1) 100%
    );
    animation: scanline 5s linear infinite;
  }
</style>

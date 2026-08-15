import type { Action } from "svelte/action";

export interface TypewriterOptions {
  text: string;
  /** Milliseconds per character. Higher is slower. */
  speed: number;
  /** Called once the whole line has been typed out. */
  ondone?: () => void;
}

/**
 * Types `text` into the node one character at a time. The caller is told when
 * the line is finished so it can send the next one, which is what keeps the
 * terminal printing in order instead of all at once.
 */
export const typewriter: Action<HTMLElement, TypewriterOptions> = (
  node,
  options
) => {
  let opts = options;
  let frame = 0;

  const run = () => {
    cancelAnimationFrame(frame);
    let index = 0;
    let last = -1;
    node.textContent = "";
    node.classList.add("typewriter");

    const tick = (time: DOMHighResTimeStamp) => {
      if (last < 0) last = time;
      while (time - last >= opts.speed) {
        last += opts.speed;
        node.textContent = opts.text.slice(0, index);
        if (index >= opts.text.length) {
          node.classList.remove("typewriter");
          opts.ondone?.();
          return;
        }
        index += 1;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };

  run();

  return {
    update(next) {
      const changed = next.text !== opts.text || next.speed !== opts.speed;
      opts = next;
      if (changed) run();
    },
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
};

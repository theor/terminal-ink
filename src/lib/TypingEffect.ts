import type { Action } from "svelte/action";
interface TypewriterOptions {
    line:string, duration: number
}
export const typewriter: Action<
  HTMLElement,
  TypewriterOptions,
  { "on:done": () => void }
> = (node: HTMLElement, {line, duration}:TypewriterOptions) => {
  let index = 0;

  let start = -1;
  console.log("> start", line);
  node.textContent = "";

  const tick = (time: DOMHighResTimeStamp) => {
    if (start < 0) {
      start = time;
    }

    const deltaTime = time - start;
    if (deltaTime > duration) {
      start = time;
      const linePart = line.slice(0, index);
    //   console.log("> tick", deltaTime, linePart);
      node.textContent = linePart;

      if (index < line.length) {
        requestAnimationFrame(tick);
        index += 1;
      } else {
        console.log("> done", line);
        node.dispatchEvent(new CustomEvent("done"));
      }
    } else {
        requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
  return {
    update(newLine) {
        if(newLine.line === line) {
            console.error("SKIP", line)
            node.dispatchEvent(new CustomEvent("done"));
            
            return;}
        console.error("> update TYPEWRITER", line, newLine);
        node.textContent = "";
        line = newLine.line;
        duration = newLine.duration;
        index = 0;
        tick(0);
    // //     line = newLine;
    // //     index = 0;
    // //     tick();
    },
    // destroy() {
    //     // the node has been removed from the DOM
    // }
  };
};
export function typewriter2(
  node: HTMLElement,
  lines: string[]
): Action<HTMLElement, string[], { "on:done": () => void }> {
  // the node has been mounted in the DOM
  console.log("start", ...lines);

  const res = {
    update(newLines: string[]) {
      let i = 0;
      for (; i < lines.length; i++) {
        if (lines[i] !== newLines[i]) {
          break;
        }
      }
      const delta =
        i === lines.length ? [...newLines.slice(lines.length)] : [...newLines];

      console.log("update", ...delta);

      let start = -1;
      const tick = (time: DOMHighResTimeStamp) => {
        if (start < 0) {
          start = time;
        }

        const deltaTime = time - start;
        if (deltaTime < 400) {
          requestAnimationFrame(tick);
        } else {
          console.log("tick", deltaTime);
          node.dispatchEvent(new CustomEvent("done"));
        }
      };
      requestAnimationFrame(tick);

      // the value of `bar` has changed
    },

    destroy() {
      // the node has been removed from the DOM
    },
  };
  res.update(lines);
  return res;
}

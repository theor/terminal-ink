import type { Action } from "svelte/action";
interface TypewriterOptions {
  line: string;
  duration: number;
}
export const typewriter: Action<
  HTMLElement,
  TypewriterOptions,
  { "on:done": () => void }
> = (node: HTMLElement, { line, duration }: TypewriterOptions) => {
  let index = 0;

  let start = -1;
  //   console.log("> start", line);
  node.textContent = "";
  node.classList.add("typewriter");

  const tick = (time: DOMHighResTimeStamp) => {
    if (start < 0) {
      start = time;
    }

    let deltaTime = time - start;
    while (deltaTime > duration) {
        deltaTime -= duration;
      start = time;
      const linePart = line.slice(0, index);
      //   console.log("> tick", deltaTime, linePart);
      node.textContent = linePart;

      if (index < line.length) {
        index += 1;
      } else {
        // console.log("> done", line);
        node.classList.remove("typewriter");
        node.dispatchEvent(new CustomEvent("done"));
        return;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return {
    update(newLine) {
      if (newLine.line === line) {
        node.classList.remove("typewriter");
        console.error("SKIP", line);
        // node.dispatchEvent(new CustomEvent("done"));

        return;
      }
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

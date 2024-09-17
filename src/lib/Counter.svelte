<script lang="ts">
  import data from "../assets/story.ink?raw";
  import { Story, Compiler, CompilerOptions } from "inkjs/full";
  import { typewriter } from "../lib/TypingEffect";

  enum LineType {
    Text,
    Title,
  }
  interface Line {
    text: string;
    type: LineType;
  }
  let lines = [] as Line[];
  $: console.warn("lines", lines);
  let tags = [] as string[];
  let choices = [] as string[];
  let debug = "";
  let speed = 5;
  let awaitInputPromise: ((input: string) => void) | null = null;
  let isFullscreen = document.fullscreenElement !== null;
  interface TagAction {
    action: (line: Line, args: string[]) => Promise<Line>;
  }
  const tagActions: { [key: string]: TagAction } = {
    password: {
      action: async (line, args) => {
        const password = args[0].toLowerCase();
        while (true) {
          var p = new Promise<boolean>((resolve, reject) => {
            awaitInputPromise = (x) => {
              awaitInputPromise = null;
              debug = x;
              resolve(x.toLowerCase() === password);
            };
            // while (true) {
            //   const input = "asd"// prompt(line.text);
            //   if (input === password) {
            //     resolve(line);
            //     break;
            //   } else {
            //     lines = [
            //       ...lines,
            //       { text: "Wrong password", type: LineType.Text },
            //     ];
            //   }
            // }
          });
          const res = await p;
          if (res) break;
          else
            lines = [...lines, { text: "Wrong password", type: LineType.Text }];
        }
        return line;
      },
    },
    speed: {
      action: async (line, args) => {
        speed = parseInt(args[0]);
        return line;
      },
    },
    title: {
      action: async (line) => {
        return { text: `// ${line.text} //`, type: LineType.Title };
      },
    },
    delay: {
      action: (line, args) => {
        const time = parseInt(args[0] ?? "1500");
        log("delay push", line.text, time);
        const p = new Promise<Line>((resolve, reject) => {
          setTimeout(() => {
            resolve(line);
          }, time);
        });
        return p;
      },
    },
    clear: {
      action: async (line) => {
        lines = [];
        return line;
      },
    },
  };
  function log(...text: any[]) {
    console.log(...text);
  }

  let compiler = new Compiler(
    data,
    new CompilerOptions(undefined, undefined, undefined, (m, t) => {
      console.log(m);
    })
  );

  const story = compiler.Compile();
  (window as any).story = story;

  story.onError = (m, t) => {
    console.log(m);
  };
  story.BindExternalFunction(
    "clear",
    () => {
      console.warn("CLEAR |||||", lines);
      lines = [];
    },
    false
  );

  async function execTags(tags: string[] | null, line: Line): Promise<Line> {
    if (!tags) return line;
    console.log("execTags", tags, story.currentText);
    for (const iterator of tags) {
      const split = iterator.split(" ");
      const tag = split[0];
      const action = tagActions[tag];
      if (action) {
        line = await action.action(line, split.slice(1));
      }
    }

    return line;
  }

  function onDoneCallback() {
    // console.log("onDone");
    poll();
  }
  async function poll() {
    while (story.canContinue) {
      // debug = JSON.stringify(story.state.callStack.callStackTrace);
      // if (story.currentTags!.length > 0)
      // await execTags(story.currentTags, null!);
      let line: Line = { text: story.Continue()!, type: LineType.Text };
      console.log(`poll: '${line.text}'`);

      if (!line.text) break;
      if (line.text === "\n") {
        line = await execTags(story.currentTags, line);
        continue;
      }

      tags = story.currentTags || [];
      if (story.currentTags!.length > 0)
        line = await execTags(story.currentTags, line);

      // log("new lines", lines, line);
      lines = [...lines, line];
      return;
    }

    choices = story.currentChoices.map((c) => c.text);
    if (story.currentChoices.length > 0) {
    }
  }

  function handleChoice(choice: number) {
    const choiceObj = story.currentChoices[choice];
    // debug =
    //   choiceObj.targetPath?.toString() +
    //   " | " +
    //   choiceObj.sourcePath.toString();
    choices = [];
    log("handleChoice", choice, choiceObj.tags);
    story.ChooseChoiceIndex(choice);

    poll();
  }

  function onInputKeyDown(e: KeyboardEvent) {
    console.log("enter", e);
    debug = ">"+e.key;
    if (e.key === "Enter") {
      e.preventDefault();
      awaitInputPromise(e.target.textContent);
    }
  }
  function onKeyDown(choice: number) {
    return (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleChoice(choice);
      }
    };
  }

  if (lines.length === 0) poll();

  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      isFullscreen = true;
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
      isFullscreen = false;
    }
  }
</script>

<div class="theme-green fullscreen">
  <div id="monitor" class="on">
    <div id="screen">
      <div id="crt">
        <div class="scanline"></div>
        <div class="terminal">
          <p>```</p>
          {#each lines as line}
            {#if line.type === LineType.Title}
              <h3
                use:typewriter={{ line: line.text, duration: speed }}
                on:done={onDoneCallback}
              >
                {line}
              </h3>
            {:else}
              <p
                use:typewriter={{ line: line.text, duration: speed }}
                on:done={onDoneCallback}
              >
                {line}
              </p>
            {/if}
          {/each}
          {#if awaitInputPromise}
            <!-- <div class="prompt-chrome">
              <input size="1" class="prompt" on:keydown={onInputKeyDown} />
            </div> -->
            <div autofocus 
            class="prompt"
            inputmode="numeric"
              contenteditable="true"
              tabindex="0"
              role="textbox"
              spellcheck="false"
              on:keypress={onInputKeyDown}
            >
            </div>
          {:else}
            <ol>
              {#each choices as choice, choiceIndex}
                <li>
                  <a
                    use:typewriter={{ line: choice, duration: speed }}
                    href="#/"
                    role="button"
                    tabindex={choiceIndex + 1}
                    on:keydown={onKeyDown(choiceIndex)}
                    on:click={() => handleChoice(choiceIndex)}
                    >{choiceIndex} {choice}</a
                  >
                </li>
              {/each}
            </ol>
          {/if}
        </div>
        <div class="debug-overlay">
          <!-- {JSON.stringify(debug)} -->
        </div>
        {#if !isFullscreen}
          <button id="toggleFullscreen" on:click={toggleFullScreen}>f</button>
        {/if}
        <!-- <button id="reload" on:click={() => location.reload()}>r</button> -->
      </div>
    </div>
  </div>
</div>

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

  interface TagAction {
    action: (line:Line) => Promise<Line>;
  }
  const tagActions: { [key: string]: TagAction } = {
    title: {
      action: async (line) => {
        return {text: line.text, type: LineType.Title};
      },
    },
    delay2: {
      action: (line) => {
        log("delay push");
        const p = new Promise<Line>((resolve, reject) => {
          setTimeout(() => {
            resolve(line);
          }, 500);
        });
        return p;
      }
    },
    clear2: {
      action: async (line) => {
        lines = [];
        return line;
      }
    },
  };
  function log(...text: any[]) {
    console.log(...text);
  }

  let compiler = new Compiler(data, new CompilerOptions(undefined,undefined,undefined,(m, t) => {
    console.log(m);
  }));
  
  const story =
    compiler.Compile();
    (window as any).story = story;

    
  story.onError = (m, t) => {
    console.log(m);
  };
  story.BindExternalFunction("clear", () => {
    console.warn("CLEAR |||||", lines);
        lines = [];
  }, false);

  async function execTags(tags: string[] | null, line: Line): Promise<Line> {
    if (!tags) return line;
    // console.log("execTags", tags, story.currentText);
    for (const iterator of tags) {
      const action = tagActions[iterator];
      if (action) {
        line = await action.action(line);
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
      debug = JSON.stringify(story.state.callStack.callStackTrace);
      // if (story.currentTags!.length > 0)
        // await execTags(story.currentTags, null!);
      let line: Line = {text: story.Continue()!, type: LineType.Text};
      console.log(`poll: '${line}'`);
      if (!line.text) break;
if(line.text === "\n") { continue; }

      tags = story.currentTags || [];
      if (story.currentTags!.length > 0)
         line = await  execTags(story.currentTags, line);
      
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
    debug = choiceObj.targetPath?.toString() + " | " + choiceObj.sourcePath.toString();
    choices = [];
    log("handleChoice", choice, choiceObj.tags);
    story.ChooseChoiceIndex(choice);

    poll();
  }
  function onKeyDown(choice: number) {
    return (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleChoice(choice);
      }
    };
  }

  poll();

  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
</script>

<div class="theme-green fullscreen">
  <div id="monitor" class="on">
    <div id="screen">
      <div id="crt">
        <div class="scanline"></div>
        <div class="terminal">
          {#each lines as line}
          {#if line.type === LineType.Title}
            <h1 use:typewriter={{ line:line.text, duration: 20 }} on:done={onDoneCallback}>
              {line}
            </h1>
          {:else}
            <p use:typewriter={{ line:line.text, duration: 20 }} on:done={onDoneCallback}>
              {line}
            </p>
          {/if}
          {/each}
          <ol>
            {#each choices as choice, choiceIndex}
              <li>
                <a use:typewriter={{ line:choice, duration: 40 }}
                  href="#/"
                  role="button"
                  tabindex={choiceIndex}
                  on:keydown={onKeyDown(choiceIndex)}
                  on:click={() => handleChoice(choiceIndex)}
                  >{choiceIndex} {choice}</a
                >
              </li>
            {/each}
          </ol>

        
        </div>
        <div class="debug-overlay">
          {JSON.stringify(debug)}
        </div>
        <button id="toggleFullscreen" on:click={toggleFullScreen}>f</button>
        <button id="reload" on:click={() => location.reload()}>r</button>
      </div>
    </div>
  </div>
</div>

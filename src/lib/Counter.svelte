<script lang="ts">
  import data from "../assets/story.ink?raw";
  import { Story, Compiler, CompilerOptions } from "inkjs/full";
  import { typewriter } from "../lib/TypingEffect";

  let lines = [] as string[];
  $: console.warn("lines", lines);
  let tags = [] as string[];
  let choices = [] as string[];
  let debug = "";

  interface TagAction {
    action: () => Promise<void>;
    after?: boolean;
  }
  const tagActions: { [key: string]: TagAction } = {
    delay2: {
      action: () => {
        log("delay push");
        const p = new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            resolve();
          }, 500);
        });
        return p;
      },
      after: true,
    },
    clear2: {
      action: async () => {
        lines = [];
      },
      after: true,
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

    
  story.onError = (m, t) => {
    console.log(m);
  };
  story.BindExternalFunction("clear", () => {
    console.log("CLEAR |||||", lines);
        lines = [];
  }, false);

  async function execTags(tags: string[] | null) {
    if (!tags) return;
    let res = true;
    log("execTags", tags);
    for (const iterator of tags) {
      const action = tagActions[iterator];
      if (action) {
        res = false;
        await action.action();
      }
      
    }
  
    return res;
  }

  function onDoneCallback() {
    console.log("onDone");
    poll();
  }
  async function poll() {
    while (story.canContinue) {
      debug = JSON.stringify(story.state.callStack.callStackTrace);
      if (story.currentTags!.length > 0)
        await execTags(story.currentTags);
      const line = story.Continue();
      log("poll", line);
      if (!line) break;

      tags = story.currentTags || [];
      if (story.currentTags!.length > 0) await  execTags(story.currentTags);
      
      log("new lines", lines, line);
      lines = [...lines, line];
      break;
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
            <p use:typewriter={{ line, duration: 20 }} on:done={onDoneCallback}>
              {line}
            </p>
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

<script lang="ts">
  import data from "../assets/story.ink?raw";
  import { Story, Compiler } from "inkjs/full";
  // import Typewriter from "svelte-typewriter";
  import { typewriter } from "../lib/TypingEffect";
  // console.log(data);

  let lines = [] as string[];
  $: console.warn("lines", lines);
  let tags = [] as string[];
  let choices = [] as string[];
  // let onDone = [] as (() => void)[]

  interface TagAction {
    action: () => Promise<void>;
    after?: boolean;
  }
  const tagActions: { [key: string]: TagAction } = {
    delay: {
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
    clear: {
      action: async () => {
        lines = [];
      },
      after: true,
    },
  };
  function log(...text: any[]) {
    console.log(...text);
  }

  const story =
    // import.meta.env.DEV ?
    new Compiler(data, {
      errorHandler: (m, t) => {
        console.log(m);
      },
    }).Compile();

  story.onError = (m, t) => {
    console.log(m);
  };
  story.BindExternalFunction("clear", (text: string) => {
    console.log(text);
  });

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
    // if(onDone.length == 0) return;
    // onDone.forEach((fn) => fn());
    // onDone = [];
    poll();
  }
  async function poll() {
    // const newLines = [];
    while (story.canContinue) {
      if (story.currentTags!.length > 0)
        await execTags(story.currentTags);
      const line = story.Continue();
      log("poll", story.currentTags, line);
      if (!line) break;

      tags = story.currentTags || [];
      if (story.currentTags!.length > 0) await  execTags(story.currentTags);
      
      log("new lines", lines, line);
      lines = [...lines, line];

      // return;

      // if(!execTags(story.currentTags))
      // execTags(story.currentTags);
      return;

      // break to let the typewriter effect kick in
      // break;
    }

    // lines = [...lines, ...newLines];
    choices = story.currentChoices.map((c) => c.text);
    if (story.currentChoices.length > 0) {
      // log("choices", ...story.currentChoices);
      // console.log(story.currentChoices);
    }
  }

  function handleChoice(choice: number) {
    const choiceObj = story.currentChoices[choice];
    choices = [];
    log("handleChoice", choice, choiceObj.tags);

    // execTags(choiceObj.tags);
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
        <!-- <Typewriter mode="cascade" interval={5} on:done={onDoneCallback} > -->
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

          <!-- <div class="tags">
            {#each tags as tag}
              <span>#{tag}</span>
            {/each}
          </div> -->
        </div>
        <!-- </Typewriter> -->
        <button id="toggleFullscreen" on:click={toggleFullScreen}>f</button>
        <button id="reload" on:click={() => location.reload()}>r</button>
      </div>
    </div>
  </div>
</div>

<script lang="ts">
  import data from "../assets/story.ink?raw";
  import { Story, Compiler } from "inkjs/full";
  // import Typewriter from "svelte-typewriter";
import { typewriter } from "../lib/TypingEffect";
  // console.log(data);

  let lines = [] as string[];
  let tags = [] as string[];
  let choices = [] as string[];
  // let onDone = [] as (() => void)[]

  interface TagAction {
    action: () => void;
    after?: boolean;
  }
  const tagActions: { [key: string]: TagAction } = {
    clear: {
      action: () => {
        log("clear push");
        lines = [];
        // onDone.push(() => {
          // lines = [];
        // });
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

  function execTags(tags: string[] | null) {
    if (!tags) return;
    let res = true;
    tags.forEach((tag) => {
      const action = tagActions[tag];
      if (action) {
        res = false;
        console.error(tag);
        action.action();
      }
    });
    log("execTags", tags, res);
    return res;
  }

  function onDoneCallback() {
    // console.log("onDone", onDone.length);
    // if(onDone.length == 0) return;
    // onDone.forEach((fn) => fn());
    // onDone = [];
    poll();

  }
  function poll() {
    // const newLines = [];
    while (story.canContinue) {
      log("poll", story.currentTags, story.currentFlowName);
      if (story.currentTags!.length > 0) 
      execTags(story.currentTags);
      const line = story.Continue();
      if (!line) break;

      tags = story.currentTags || [];
      if (story.currentTags!.length > 0) 
      execTags(story.currentTags);


      lines = [...lines, line];
      return;

      // if(!execTags(story.currentTags))
      // execTags(story.currentTags);
      // break;

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

            <p  use:typewriter={{line, duration: 40}}  on:done={onDoneCallback}>{line}</p>
          {/each}
        <ol>
            {#each choices as choice, choiceIndex}
              <li>
                <a
                  href="#/"
                  role="button"
                  tabindex={choiceIndex}
                  on:keydown={onKeyDown(choiceIndex)}
                  on:click={() => handleChoice(choiceIndex)}>{choiceIndex} {choice}</a
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

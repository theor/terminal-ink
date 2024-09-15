<script lang="ts">
  import data from "../assets/story.ink?raw";
  import { Story, Compiler } from "inkjs/full";
  console.log(data);

  let lines = [] as string[];
  let tags = [] as string[];
  let choices = [] as string[];

  interface TagAction {
    action: () => void;
    after?: boolean;
  }
  const tagActions: { [key: string]: TagAction } = {
    clear: {
      action: () => {
        lines = [];
      },
      after: true,
    },
  };

  const story =
    // import.meta.env.DEV ?
    new Compiler(data, {
      errorHandler: (m, t) => {
        console.log(m);
      },
    }).Compile();


story.onError = (m, t) => { console.log(m); };
    story.BindExternalFunction("clear", (text: string) => {
    console.log(text);
  });

  function poll() {
    // const newLines = [];
    while (story.canContinue) {
      const line = story.Continue();
      if (!line) break;

      tags = story.currentTags || [];
      if (story.currentTags) console.log(story.currentTags);
      
      
    lines = [...lines, line];
      // newLines.push(line);

      const actions: TagAction[] = (story.currentTags ?? [])
        .map((tag) => tagActions[tag])
        .filter((a) => a);
      actions.forEach((action) => {
        // if (!action.after)
        action.action();
      });
    }

    // lines = [...lines, ...newLines];
    choices = story.currentChoices.map((c) => c.text);
    // if (story.currentChoices.length > 0) {
    // console.log(story.currentChoices);
    // }
  }

  function handleChoice(choice: number) {
    const choiceObj = story.currentChoices[choice];
    const actions: TagAction[] = (choiceObj.tags ?? [])
      .map((tag) => tagActions[tag])
      .filter((a) => a);

    actions.forEach((action) => {
      if (!action.after) action.action();
    });
    story.ChooseChoiceIndex(choice);
    actions.forEach((action) => {
      if (!action.after) action.action();
    });
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
</script>

<div class="wrapper">
  <div class="glass">
    <div class="screen greentheme">
      <div>
        {#each lines as line}
          <p>{line}</p>
        {/each}
        <ol>
          {#each choices as choice, choiceIndex}
            <li>
              <a
                href="#/"
                role="button"
                tabindex={choiceIndex}
                on:keydown={onKeyDown(choiceIndex)}
                on:click={() => handleChoice(choiceIndex)}>{choice}</a
              >
            </li>
          {/each}
        </ol>
        <div class="tags">
          {#each tags as tag}
            <span>#{tag}</span>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

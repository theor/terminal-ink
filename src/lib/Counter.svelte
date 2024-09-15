<script lang="ts">
  import data from "../assets/story.ink?raw";
  import { Story, Compiler } from "inkjs/full";
  console.log(data);

  let lines = [] as string[];
  let choices = [] as string[];

  const story =
    // import.meta.env.DEV ?
    new Compiler(data, {
      errorHandler: (m, t) => {
        console.log(m);
      },
    }).Compile();


  function poll() {
    const newLines = [];
    while (story.canContinue) {
      const line = story.Continue();
      if (!line) break;
      console.log(line);
      newLines.push(line);
    }
    
    lines = [...lines, ...newLines];
    choices = story.currentChoices.map((c) => c.text);	
    // if (story.currentChoices.length > 0) {
      // console.log(story.currentChoices);
    // }
  }

  function handleChoice(choice: number) {
    story.ChooseChoiceIndex(choice);
    poll();
  }

  poll();
</script>
<div class="wrapper">
<div class="glass">
  <div class="screen greentheme">
{#each lines as line}
  <p>{line}</p>
{/each}
<ol>
{#each choices as choice, choiceIndex}
  <li><a href="#" on:click={() => handleChoice(choiceIndex)}>{choice}</a></li>
{/each}
</ol>
</div>
</div>
</div>

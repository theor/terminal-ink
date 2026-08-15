<script lang="ts">
  import { parse, Root } from "./Parser";
  import { Runner } from "./Runner";

  let text = String.raw`= rootblock
* root
  * diag
    Generator off
    backup generator off
  * ops
    -> block2
  * -> root
= block2
* b2
  * b21
    * b22
`;
  let lines: string[] = [];
  let choices: string[] = [];
  let runner: Runner;

  function poll() {
    while (runner.canContinue) {
      console.log("continue");

      lines.push(runner.continue()!);
    }
    choices = runner.choices;
  }
  function selectChoice(choice: number){
    runner.selectChoice(choice);
    poll();
  }

  $: parsed = parse(text);

  $: {
    if (parsed instanceof Root) runner = new Runner(parsed);
    poll();
  }

  import type monaco from "monaco-editor";
  import { onMount } from "svelte";
  import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
  import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
  import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
  import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
  import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

  let divEl: HTMLDivElement = null!;
  let editor: monaco.editor.IStandaloneCodeEditor;
  let Monaco;

  onMount(async () => {
    // @ts-ignore
    self.MonacoEnvironment = {
      getWorker: function (_moduleId: any, label: string) {
        if (label === "json") {
          return new jsonWorker();
        }
        if (label === "css" || label === "scss" || label === "less") {
          return new cssWorker();
        }
        if (label === "html" || label === "handlebars" || label === "razor") {
          return new htmlWorker();
        }
        if (label === "typescript" || label === "javascript") {
          return new tsWorker();
        }
        return new editorWorker();
      },
    };

    Monaco = await import("monaco-editor");
    editor = Monaco.editor.create(divEl, {
      value: text,
      language: "story",
    });
    editor.onDidChangeModelContent(() => {
      text = editor.getValue();
    });

    return () => {
      editor.dispose();
    };
  });
</script>

<div class="root">
  <div>
    <div bind:this={divEl} class="h-screen" />
  </div>
  <!-- <textarea bind:value={text} rows="20" cols="80"></textarea> -->
  <pre>{parsed?.toString()}</pre>
  <pre>{JSON.stringify(parsed, null, 2)}</pre>
  <div>
    {#each lines as line}
      <div>{line}</div>
    {/each}
    {#each choices as choice, i}
      <button on:click={() => selectChoice(i)}>{choice}</button>
    {/each}
  </div>
</div>

<style>
  .h-screen {
    height: 100%;
  }
  .root {
    height: 90vh;
  }
  pre {
    white-space: pre-wrap; /* Since CSS 2.1 */
  }

  div.root {
    display: flex;
    flex-direction: row;
  }
  div > * {
    flex: 1;
    flex-shrink: 0;
  }
</style>

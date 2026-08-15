import { Root, Block, Choice, Text, Error, INode } from "./Parser";

export interface StackElt {
  node: INode;
  index: number;
}

export class Runner {
  root: Root;
  canContinue: boolean = true;
  stack: StackElt[];
  choices: string[] = [];

  public selectChoice(choiceIndex: number) {
    console.log(this.cur);

    if (this.cur.node instanceof Block) {
      this.stack.push({ node: this.cur.node.choices[choiceIndex], index: 0 });
      this.canContinue = true;
    }
  }
  get cur(): StackElt {
    return this.stack[this.stack.length - 1];
  }
  // setIndex(index:number) {
  //   this.cur.index = index;
  // }
  constructor(root: Root) {
    this.root = root;
    this.stack = [{ node: root, index: 0 }];
  }
  continue(): string | undefined {
    while (this.canContinue) {
      console.log(this.cur);
      const { node, index } = this.cur;

      if (node instanceof Root) {
        console.log("ROOT");
        if (this.cur.index >= node.blocks.length) {
          this.canContinue = false;
          continue;
        }
        this.cur.index++;
        this.stack.push({ node: node.blocks[index], index: 0 });
        // return true;
      } else if (node instanceof Block) {
        console.log("BLOCK");
        this.canContinue = false;
        this.choices = node.choices.filter(x => x instanceof Choice).map(c => (c as Choice).name);

        // this.cur.index++;
        // this.stack.push({ node: node.choices[index], index: 0 });
      } else if (node instanceof Choice) {
        console.log("CHOICE", node.name);
        if (this.cur.index >= node.choices.length) {
          this.stack.pop();
          continue;
        }
        this.cur.index++;
        this.stack.push({ node: node.choices[index], index: 0 });
        return node.name;
      } else if (node instanceof Text) {
        console.log("TEXT", node.text);
        this.canContinue = false;
        return undefined;
      } else if (node instanceof Error) {
        console.log("ERROR");
        this.canContinue = false;

      }
      // return false;
    }
    return undefined;

  }
}

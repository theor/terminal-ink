import { FailedMatchResult } from "ohm-js";
import type { ArithmeticSemantics } from "./grammar.ohm-bundle";
import grammar from "./grammar.ohm-bundle";

const semantics: ArithmeticSemantics = grammar.createSemantics();
// export const grammar = grammar;

export interface INode {
  type: string;
  indent: number;
}
export abstract class NodeChoices implements INode {
  abstract type: string;
  indent: number;
  choices: INode[];
  constructor(choices: INode[], indent: number) {
    this.choices = choices;
    this.indent = indent;
  }
}
export class Text implements INode {
  text: string;
  indent: number;
  constructor(text: string, indent: number) {
    this.text = text;
    this.indent = indent;
  }
  type: string = "Text";
  toString() {
    return this.text.padStart(this.indent + this.text.length + 2);
  }
}
export class Choice extends NodeChoices {
  type: string = "Choice";
  name: string;
  
  constructor(name: string, indent: number) {
    super([], indent);
    this.name = (name ?? "").trim();
  }
  toString() {
    return (
      ("* " + this.name).padStart(this.indent + this.name.length + 2) +
      "\n" +
      this.choices.map((c) => c.toString()).join("\n")
    );
  }
}
export class Root implements INode {
  type: string = "Root";
  blocks: Block[];
  indent = 0;
  constructor(blocks: Block[]) {
    this.blocks = blocks;
  }
  toString() {
    return this.blocks.map((b) => b.toString()).join("\n");
  }
}
export class Block implements INode {
  type: string = "Block";
  name: string;
  indent = 0;
  choices: INode[];
  constructor(name: string, choices: INode[]) {
    this.name = name;
    this.choices = choices;
  }
  toString() {
    return `= ${this.name}\n${this.choices
      .map((c) => c?.toString())
      .join("\n")}`;
  }
}
export class Error implements INode {
  type: string = "Error";
  indent = 0;
  error: string;
  constructor(error: string) {
    this.error = error;
  }
  toString() {
    return this.error;
  }
}

type EvalType = INode | undefined | string | number | INode[];
semantics.addOperation<EvalType>("eval", {
  Exp(blocks) {
    return new Root(blocks.eval());
  },
  Block(tEq, ident, nl, choices) {
    return new Block(ident.sourceString, choices.eval());//, arg1, arg2, arg3, arg4);
  },
  indent(arg0) {
    return arg0.sourceString.length;
  },
  text(arg0, arg1) {
    const trimmed = (this.sourceString ?? "").trim();
    return trimmed.length > 0 ? new Text(trimmed, arg0.eval() as number) : undefined;
  },
  choice(indent, _asterisk, text) {
    // console.log(text.eval());
    let textarray: Text[] = text.eval().filter((x:INode) => x !== undefined) as Text[];
    // let next = textarray.length > 1 ? new Text(textarray.slice(1).map(x => x.text.trim()).join("\n")) : undefined;
    console.log(textarray)
      return new Choice(textarray[0].text, indent.eval() as number);
  },
  _iter(...children) {
    return children.map((c) => c.eval() as INode);
  },
  ident(_, __) {
    return this.sourceString;
  },
});

// export function parse(input: string){
//     const m = grammar.match(input);
//     if(m.succeeded()){
//       return semantics(m).eval();
//     } else {
//       return new Error("Parse error:\n" + m.message);
//     }
// }

let max = 100;
function rec(
  source: INode[],
  it: { sourceIndex: number },
  target: INode[],
  indent: number
) {
  while (true) {
    if (max-- <= 0) throw "loop";
    if (it.sourceIndex >= source.length) return;
    // console.log(source, it.sourceIndex, target, indent);

    const cur = source[it.sourceIndex];
    if (cur.indent < indent) {
      return;
    }
    if (cur.indent === indent) {
      target.push(cur);
      it.sourceIndex++;
      if (cur.type === "Choice") {
        let choiceNode = cur as Choice;
        rec(source, it, choiceNode.choices, indent + 2);
      }
    } else {
      // if (cur.type === "Choice") {
      //   let choiceNode = cur as Choice;
      //   rec(source, it, choiceNode.children, indent + 2);
      // } else if(cur.type === "Text") {
      //   target.push(cur);
      //   it.sourceIndex++;
      // } else {
      //   throw "unexpected type: " + cur.type;
      // }
    }
  }
}

export function parse(input: string) {
  const m = grammar.match(input);
  if (m.succeeded()) {
    let root = semantics(m).eval() as Root;
    let it = { sourceIndex: 0 };
    rec(root.blocks, it, root.blocks, 0);
    return root;
  } else {
    return new Error("Parse error:\n" + (m as FailedMatchResult).message);
  }
}
// const m = grammar.match(text);
// console.log(semantics(m).eval().toString());

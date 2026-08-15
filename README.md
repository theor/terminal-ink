# Terminal

A fake terminal for TTRPGs. I use it to run [Mothership](https://www.tuesdayknightgames.com/pages/mothership-rpg) sessions.

The terminal is scripted in a small format of its own (`.term`). It used to be
driven by Inkle's [Ink](https://github.com/inkle/ink), but Ink is built for
stories -- branching prose that moves forward -- whereas a terminal is a set of
screens you navigate, redraw, and come back to. The format here is built around
that instead.

# Usage

The most flexible option is to run a dev server on a machine, then access it from
a device on the game table (iPad, phone, ...). It allows to update the content
live.

- clone
- `yarn && yarn dev`
- edit the story in the left-hand pane; the terminal on the right restarts as you type

`src/assets/story.term` is what the editor opens with.

# The format

A story is a list of **blocks**. A block is one screen: it prints its lines, then
offers its choices and waits.

```
= main #clear
GRETA BASE #title
Generator: {generator}
* Diagnostics -> diagnostics
* Toggle generator
  set generator = on
  Generator spinning up... #delay 800
* Reboot -> boot
```

| Syntax | Meaning |
| --- | --- |
| `= name` | starts a block. Content before the first one goes into an implicit `start` block. |
| plain text | a line to print |
| `* label` | a choice. Lines indented under it run when it is picked. |
| `-> target` | go to a block. Also valid inline on a choice: `* Comms -> comms` |
| `-> back` | return to the screen you came from |
| `-> end` | stop |
| `set name = value` | assign a variable |
| `{name}` | print a variable. An unset one prints as `{name}`. |
| `// ...` | comment |

Choices nested under a choice become a sub-menu; `-> back` leaves it.

A choice that neither diverts nor opens a sub-menu **redraws the current block**,
which is how a screen picks up a variable you just changed. Put `#clear` on the
block header so the redraw replaces the screen instead of scrolling.

`set` runs whenever it is executed, redraws included -- so initialisation belongs
in a block you divert away from (like `boot`), not in a menu you return to.

Text lines are matched one at a time, so a line that does not parse is reported
on its own and the rest of the story keeps running.

# Tags

Tags go at the end of a line, or on a line of their own. They also work on a
block header, where they run as the block is entered.

- `#speed <number>` changes the speed of the typewriter effect - the higher, the slower
- `#delay <milliseconds>` waits after the line is printed - defaults to 1500
- `#title` outputs a header
- `#clear` wipes the screen
- `#password <digits>` prompts for a password and **stops the story until it is
  answered** (digits only for now)

# Development

- `yarn test` - grammar, parser and runner tests (node's test runner, no extra deps)
- `yarn run check` - svelte-check and tsc
- `yarn gen2` - regenerate the Ohm parser bundle after editing `src/lib/grammar.ohm`

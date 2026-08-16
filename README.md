# Lore Weaver

A fake terminal for TTRPGs. I use it to run [Mothership](https://www.tuesdayknightgames.com/pages/mothership-rpg) sessions.

The terminal is scripted in a small format of its own (`.lore`). It used to be
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

`src/assets/story.lore` is what the editor opens with; the dropdown in the
toolbar switches to `grimoire.lore`, a short example of the library theme.

The preview restarts at **the block the cursor is in** — `from <block>` in the
toolbar — so writing a screen deep in the story shows you that screen rather
than making you click down to it again after every edit. Untick it to run from
the top. Nothing before the block ran, so variables it expects are unset.

**play** hides the editor and gives the terminal the whole screen: what the
table should be looking at. The way back is a button in the top-left corner,
invisible until hovered so it stays out of the fiction. The mode is in the URL,
so `http://<host>:5173/?play` opens the tablet straight into it -- and a page
opened that way never downloads the editor at all, which is most of what this
app ships.

# The format

A tour follows; [`FORMAT.md`](FORMAT.md) is the full reference -- every line
form, every `#tag`, and the traps worth knowing before you write a long one.

A story is a list of **blocks**. A block is one screen: it prints its lines, then
offers its choices and waits.

```
= main #clear
GRETA BASE #title
Generator: {generator}
* Diagnostics -> diagnostics
* Toggle generator #set generator = "on"
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
| `#set name = <expr>` | assign a variable. Text goes in quotes: `#set gen = "on"` |
| `#if <expr>` | run this line only while the expression is true |
| `{name}` | print a variable. An unset one prints as `{name}`. |
| `\#` | print a reserved character literally |
| `// ...` | comment |

Every line form but plain text starts with a sigil, so no line of prose can
turn into a directive by accident -- a line reading `set course = home` prints,
it does not assign.

Choices nested under a choice become a sub-menu; `-> back` leaves it.

A choice that neither diverts nor opens a sub-menu **redraws the current screen**,
which is how a screen picks up a variable you just changed. Put `#clear` on the
block header so the redraw replaces the screen instead of scrolling.

Inside a sub-menu the current screen is the sub-menu, so a redraw refreshes only
the lines under that choice -- whatever the block printed above stays as it was.
If a change needs to refresh the whole screen, divert to a block (`-> shelf`)
rather than nesting.

`#set` runs whenever it is executed, redraws included -- so initialisation
belongs in a block you divert away from (like `boot`), not on a menu you return
to.

Text lines are matched one at a time, so a line that does not parse is reported
on its own and the rest of the story keeps running.

# Tags

Tags go at the end of a line, or on a line of their own. They also work on a
block header, where they run as the block is entered.

- `#set <name> = <expression>` assigns a variable, and on a choice it fires when
  that choice is picked: `* Toggle #set gen = "on"`
- `#if <expression>` runs the line only when the expression is true. On a choice
  it decides whether the choice is offered at all; on a divert, whether the
  story goes there
- `#speed <number>` changes the speed of the typewriter effect - the higher, the slower
- `#delay <milliseconds>` waits after the line is printed - defaults to 1500
- `#title` outputs a header
- `#clear` wipes the screen
- `#password <word>` prompts for a password and **stops the story until it is
  answered**
- `#theme <name>` switches the look (see below)

`#set` and `#if` take a real expression -- numbers, quoted strings, booleans,
variables, `+ - * /`, `= != < <= > >=`, `and` / `or` / `not`, and parentheses:

```
#set load = load + 55
CAUTION: CORE LOAD HIGH #if load > 80
* Emergency purge -> purge #if coolant = "low" and load < 90
```

A bare word is a **variable**, so text goes in quotes. See
[`FORMAT.md`](FORMAT.md#expressions).

Those eight are the whole set, and each is defined in one place --
`src/lib/tags.ts` holds how a tag reads its arguments, where it may be written,
what it does to the story and what it does to the screen. Adding one is an entry
there. The grammar knows only that a tag is a name and some arguments -- not
their names, and not that the `=` in `#set x = 1` means anything.

[`FORMAT.md`](FORMAT.md#tags) covers where each may sit and when it fires -- a
header tag re-fires on every redraw, a tag on a choice fires when that choice is
picked.

# Themes

A theme is the object the fiction says you are looking at. Two ship today:

| Name | |
| --- | --- |
| `crt` | green phosphor terminal, scan lines, blinking block cursor (default) |
| `library` | a warded book: parchment, leather binding, candlelight, ink |

Select one with a tag, usually on the first block:

```
= wake #theme library
```

It can change mid-story -- put `#theme` on any block header and that screen
onwards uses it.

A theme is a frame plus a set of CSS custom properties, and nothing else. See
`src/lib/themes/`: a chrome component draws the frame and declares the
properties (`--term-color`, `--term-font`, `--term-prompt-marker`, ...), and a
registry entry gives it its wording -- a CRT denies access, a book refuses you.
The content markup in `Terminal.svelte` is shared and reads only those
properties, so adding a third theme means adding a directory, not editing the
terminal.

Fonts are self-hosted in `public/fonts`, because the machine running this at a
game table may well have no wifi.

# Development

- `yarn test` - grammar, parser and runner tests (node's test runner, no extra deps)
- `yarn run check` - svelte-check and tsc
- `yarn gen2` - regenerate the Ohm parser bundle after editing `src/lib/grammar.ohm`

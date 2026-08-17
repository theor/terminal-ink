# Lore Weaver

A fake terminal for TTRPGs. I use it to run [Mothership](https://www.tuesdayknightgames.com/pages/mothership-rpg) sessions.

The terminal is scripted in a small format of its own (`.lore`). It used to be
driven by Inkle's [Ink](https://github.com/inkle/ink), but Ink is built for
stories -- branching prose that moves forward -- whereas a terminal is a set of
screens you navigate, redraw, and come back to. The format here is built around
that instead.

Demo: https://terminal-ink.netlify.app/#/



https://github.com/user-attachments/assets/8a5d774f-929a-469a-a3ba-9eb2cf37c7f7



# Usage

The most flexible option is to run a dev server on a machine, then access it from
a device on the game table (iPad, phone, ...). It allows to update the content
live.

- clone
- `yarn && yarn dev`
- edit the story in the left-hand pane; the terminal on the right restarts as you type

`src/assets/story.lore` is what the editor opens with the first time; the
dropdown in the toolbar switches to `grimoire.lore`, a short example of the
library theme. After that it opens with whatever you were last looking at --
see [Keeping and sharing](#keeping-and-sharing).

The preview restarts at **the block the cursor is in** — `from <block>` in the
toolbar — so writing a screen deep in the story shows you that screen rather
than making you click down to it again after every edit. Untick it to run from
the top. Nothing before the block ran, so variables it expects are unset.

**fast** runs the preview with no pacing at all: lines appear whole and
`#delay` waits for nothing. It is for walking a branch you are editing, not for
reading the story as written -- leave it off to see what the table will see.

**play** hides the editor and gives the terminal the whole screen: what the
table should be looking at. The way back is a button in the top-left corner,
invisible until hovered so it stays out of the fiction -- or the browser's own
back button, since the two modes are two entries in history. Choices are not:
taking one is a move in the story, not a place to come back to. The mode is in the URL,
so `http://<host>:5173/?play` opens the tablet straight into it -- and a page
opened that way never downloads the editor at all, which is most of what this
app ships. A page opened straight into play mode also waits to be started --
one line on the screen and nothing else until a key or a tap -- so the tablet
can be set down on the table long before anyone looks at it. Reaching play mode
from the editor does not ask: that story is already running.

Choices answer to the keyboard as well as to the mouse: **1**–**9** take one
outright, **↑**/**↓** move the mark and **Enter** takes what it sits on. The
mark is the theme's own -- `[brackets]` on the terminal, a pointing hand in the
book. Keys typed in the editor stay in the editor.

# Keeping and sharing

What you type is kept in the browser you typed it in, so a refresh, a closed
tab or a laptop that slept at the table does not cost an evening's writing.
The dropdown remembers which story you were on, and switching away and back
keeps the edits rather than re-reading the file.

Only stories you have *changed* are kept. A built-in you have not touched goes
on coming from the bundle, which is what lets you edit `src/assets/story.lore`
on disk and still see it in a browser that has been open all along -- the
dev-server workflow above. Type a change and your copy shadows the file; undo
back to the original text and it stops.

**share** puts the whole story in a link -- in the `#fragment`, so it is never
sent to a server and never turns up in a host's logs. There is nothing to sign
into and nothing to be up: the story travels in the URL itself. A story of the
size here is about 1KB of link.

A link is a **snapshot**. It says what the story was when the link was made,
and it goes on saying that after you have moved on; the two ends never talk
again. Edit and send a new one.

Opening a link is an import, not a takeover: the story lands in the dropdown
beside whatever that browser already had, under a free name, and gets
selected. Nothing is written over, so following your own link on the machine
the stories live on costs nothing -- and following the same link twice picks
the story already there rather than piling up copies. The fragment is cleared
once the story is out of it.

`?play` and a link compose, so `?play#lore=...` opens a tablet straight into a
story it has never seen -- waiting for a tap, and still without downloading the
editor.

A link that arrives cut short -- shortened by whatever carried it, most
likely -- says so rather than leaving the device quietly running the story it
already had, which from across a table looks exactly like success. It says so
in play mode too, where the toolbar that would otherwise carry the news is off
the side of the window. The URL is left as it came, so a reload can try again.

Where a browser will not hand over the clipboard -- which includes the plain
`http://` dev server this is mostly run from -- the link appears in the toolbar
instead, selected and ready to copy.

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
| `{name}` | print a variable. An unset one prints as `{name}`, and a name no `#set` anywhere assigns is warned about in the editor. |
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
to. Starting values -- and the theme -- belong in a `#prelude` block, which is
applied before anything runs and wherever the story is started from.

Text lines are matched one at a time, so a line that does not parse is reported
on its own and the rest of the story keeps running.

# Tags

Tags go at the end of a line, or on a line of their own. They also work on a
block header, where they run as the block is entered.

- `#set <name> = <expression>` assigns a variable, and on a choice it fires when
  that choice is picked: `* Toggle #set gen = "on"`
- `#prelude` on a block header marks it as declarations rather than a screen:
  its `#set`s -- and its `#theme` and `#speed`, which are settings rather than
  things that happen -- are applied before anything runs, however the story was
  started, and the block itself is never entered
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

Those nine are the whole set, and each is defined in one place --
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

The editor pane is CodeMirror 6, and everything about it lives in
`src/lib/loreEditor.ts`: the tokenizer, which reads its list of state-changing
tags from `tags.ts` so a new tag colours itself; the error markers, fed from
the same `parse()` the preview runs on; and the theme. Nothing above that file
mentions CodeMirror, which is also what lets play mode skip loading it.

- `yarn test` - grammar, parser and runner tests (node's test runner, no extra deps)
- `yarn run check` - svelte-check and tsc
- `yarn gen2` - regenerate the Ohm parser bundle after editing `src/lib/grammar.ohm`

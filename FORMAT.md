# The `.term` format

Reference for the story format this terminal runs. `src/lib/grammar.ohm` is the
authority on syntax; this document explains what the syntax *means* and how to
write with it.

- [Mental model](#mental-model)
- [Lines](#lines-the-grammar)
- [Blocks and flow](#blocks-and-flow)
- [Screens, redraws and sub-menus](#screens-redraws-and-sub-menus)
- [Variables](#variables)
- [Tags](#tags) — every `#pound` directive
- [Themes](#themes)
- [What the format does not have](#what-the-format-does-not-have)
- [Errors](#errors)
- [Grammar listing](#grammar-listing)

## Mental model

Ink and its relatives model a *story*: prose that moves forward and does not
come back. A terminal is not that. A terminal is a **set of screens** you
navigate, redraw, and return to, where the same screen can look different the
second time because something changed in between.

So the unit here is the **block**, and a block is one screen. Entering it prints
its lines top to bottom, then it offers its choices and waits. Picking a choice
either takes you to another screen, opens a sub-menu, or redraws the screen you
are on.

```
= main #clear
GRETA BASE #title
Generator: {generator}
* Diagnostics -> diagnostics
* Toggle generator #set generator = on
  Generator spinning up... #delay 800
* Reboot -> boot
```

Two working stories ship in `src/assets/`: `story.term` (a Mothership session
terminal) and `grimoire.term` (a warded book, exercising the library theme).

### The edit loop

You write in the left-hand pane and watch the terminal on the right. Half a
second after your typing settles the preview **restarts from the first block** —
it is a fresh run, not a hot patch, so variables, theme and speed all reset.

Testing a screen five diverts deep therefore means clicking back down to it after
every edit, re-entering any `#password` on the way. Two habits make that
bearable: draft a new screen as the *first* block in the document and move it
into place once it reads right, or comment out the gate while you work on what is
behind it.

## Lines (the grammar)

The parser is **line-based**: the source is split on newlines and every line is
matched on its own, against exactly one of seven forms. Nothing spans lines.

| Form | Example | Meaning |
| --- | --- | --- |
| block header | `= main` | starts a block, optionally `= main #clear` |
| text | `Reactor nominal` | a line to print |
| choice | `* Diagnostics` | an option; lines indented under it run when picked |
| divert | `-> comms` | go to a block |
| tag line | `#clear` | directives with no text of their own; prints nothing |
| comment | `// note to self` | dropped entirely |
| blank | | prints a blank line |

A choice may carry an inline divert: `* Comms -> comms`. Every form may carry
tags at the end of the line — including `#set`, which is how you assign a
variable.

Every form but text starts with a sigil (`=`, `*`, `->`, `#`, `//`), and a
sigil is the only thing that can make a line stop being prose. Assignment used
to be the exception — a `set` **keyword** — which meant a line of dialogue like
`set course = home` silently became a state change and never printed. It is a
tag now, so that cannot happen.

This matters when you write: **a line that does not parse is reported on its
own, and every other line still runs.** The editor reparses on each keystroke,
so a half-typed line does not blank the preview.

### Disambiguation

Prose comes first in most ties, because a terminal prints a lot of text that
looks like syntax:

| Line | Parsed as | Why |
| --- | --- | --- |
| `=== SYSTEM ===` | text | a run of `=` is a rule, not a header |
| `set generator = on` | text | assignment is `#set`; this is just a line |
| `Reactor = nominal` | text | a header needs `=` *first* |
| `text // not a comment` | text | `//` only comments when it starts the line |
| `#setting up` | text + tag | a tag name is a whole word; this one is not `#set` |
| `= 9lives` | **error** | a block name may not start with a digit |
| `= ` | **error** | a header needs a name |
| `->` | **error** | a divert needs a target |
| `#set x` | **error** | a `#set` that is not an assignment is never inert |

Names (blocks, variables) are `letter or _` followed by letters, digits, `_`.

### Indentation

Indentation nests choices, and only choices. Any run of spaces or tabs works,
but a **tab counts as one column**, so do not mix tabs and spaces in one
document or nesting will not line up with what you see.

A blank line is real output — terminals use them for spacing — and carries no
indentation, so it does **not** close an open choice. You can space out the body
of a choice freely.

### Escapes

A backslash prints the next character literally:

```
C\# is a language
Cost \{5\} credits
Use the \-> arrow
```

`\` works on the seven characters that mean something to the parser — **`#`,
`{`, `}`, `=`, `*`, `-`, `/`** — and that is the whole set. Escaping `-` is how
you write a literal `\->`; escaping `/` is how you start a line with `\//`.

**Everywhere else a backslash is just a backslash.** `C:\Users\theor` and
`\\SERVER\share` print exactly as written, with no doubling — which is the
point, because a terminal prints a lot of paths and ASCII art and should not
have to be escaped line by line.

At the start of a line, an escape also stops a sigil from opening a line form,
so a screen can print things that look like syntax:

```
\* not a choice, just a bullet
\= not a header
\// not a comment
```

Two places escapes do **not** reach:

- A backslash immediately before one of the seven characters. `\#` always means
  a literal `#`, never backslash-then-tag.
- A tag's **arguments**. They stop at `#` and at `->`, and a backslash in there
  is a plain backslash, so `#password se\#ret` reads as a `#password` of `se\`
  followed by a second tag called `ret` — it parses, but not as it looks. Keep
  `#` and `->` out of tag arguments. (Spaces are fine in a `#set` or `#if`
  value, which is everything after the `=`.)

## Blocks and flow

**The story starts at the first block in the document.** Not at a block named
`start` — the name is not special. `story.term` opens on `boot` and *also*
contains a block called `start`, which is reached only by the `-> start` at the
end of `boot`.

Content written before any `=` header goes into an implicit block named `start`,
so a brand-new document runs without writing a header first. Note the collision:
a document with loose content at the top **and** a `= start` header later gets
`Duplicate block name "start"`, reported against the header you did write.

Block names must be unique; a duplicate is an error and the first one wins.

### Diverts

| | |
| --- | --- |
| `-> name` | go to that block |
| `-> back` | return to the screen you came from |
| `-> end` | stop; the terminal prints the theme's end line |

`-> back` at the outermost screen has nowhere to go, so it redraws instead of
underflowing. A divert on a choice line runs the choice's indented body *first*,
then jumps.

A block that reaches its end with no choices and no divert halts.

## Screens, redraws and sub-menus

A **screen** is what the player is looking at: a block, or the sub-menu formed
by the choices nested under one choice. Screens stack as you navigate in;
`-> back` pops one.

What happens when a choice is picked depends on its body:

| The choice… | Result |
| --- | --- |
| has nested choices under it | opens a **sub-menu** (pushes a screen) |
| has an inline `-> target` | runs its body, then **diverts** |
| has neither | **redraws** the current screen |

That third case is the load-bearing one. A plain choice runs its body and then
re-runs the screen you are already on, which is how a screen picks up a variable
the choice just changed — without the back-stack growing on every click.

Put `#clear` on the block header so the redraw *replaces* the screen instead of
appending a second copy below the first. This works because **header tags re-fire
on every redraw**, exactly as they do on entry.

Inside a sub-menu the current screen *is* the sub-menu, so a redraw refreshes
only the lines under that choice; whatever the block printed above it stays as
it was. If a change needs to refresh the whole screen, divert to a block
(`-> shelf`) rather than nesting.

## Variables

Assignment is the `#set` tag, so it can sit on a line of its own or ride on any
other line:

```
#set generator = on
#set candle = burning bright
Generator: {generator}
* Toggle generator #set generator = on
```

- Values are **strings**, taken from after the `=` to the end of the line (or to
  the next tag) and trimmed. Spaces are kept, so `burning bright` is one value.
  Quotes are not syntax; they would be part of the value, and so would a trailing
  `//` — a comment only comments when it *starts* the line.
- `{name}` substitutes. An **unset** variable prints literally as `{name}`,
  which makes a typo visible on screen rather than silently blank.
- Choice labels interpolate too: `* Take the {weapon}`.
- Variables are global, and cleared when the story restarts.
- A `#set` runs **before the line it sits on prints**, the same order `#clear`
  runs in — so `Generator: {generator} #set generator = on` prints `Generator:
  on`.

**A `#set` runs every time it is executed — redraws included.** On a block
header it therefore re-initialises the block on every redraw, undoing whatever
the menu just changed:

```
// WRONG: the header runs again on every redraw, undoing the toggle
= main #set generator = off
Generator: {generator}
* Toggle #set generator = on
```

Initialise in a block you divert *away* from (like `boot`), not in a menu you
return to.

### Writing an assignment as text

Because assignment is a tag, prose that looks like one just prints:

```
set generator = on
```

That line is output, not a state change — useful for a terminal that echoes
commands back at the player.

## Tags

A tag is `#name`, optionally followed by whitespace-separated arguments:
`#delay 800`. Tags go at the end of any line, or on a line of their own. Several
may share a line: `..... #speed 40 #delay 800`.

There are **eight** tags, listed in `src/lib/tags.ts` — one entry each, holding
everything about them. A name that is not in that list parses fine and is
carried along, but nothing consumes it: an unknown tag is inert, which is the
only way a tag is allowed to do nothing quietly.

A tag that *is* in the list is checked against its entry, and reported if it
does not match: wrong number of arguments (`#speed` with none), a missing `=`
(`#set x on`), or a position where it would have no effect (`#title` on a block
header).

### Where a tag can sit, and when it fires

| Position | Example | Fires |
| --- | --- | --- |
| block header | `= main #clear` | on entering the block, **and again on every redraw of it** |
| text line | `Airlock sealed #delay` | with that line, as it prints |
| own line | `#clear` | at that point in the block; prints nothing |
| choice line | `* Reboot #delay 500` | when the choice is **selected**, before its body runs — not while it is displayed |
| divert line | `-> main #set seen = 1` | when the divert is taken |

A tag on a choice that opens a **sub-menu** acts as that sub-menu's header tags:
it fires on entry and on every redraw of the sub-menu. That is how you get a
sub-menu to clear itself.

Two tags are restricted, because the missing positions would have no meaning:
`#title` decorates a printed line and so is **text lines only**, and `#if`
cannot sit on a **block header**. Writing them elsewhere is an error rather
than a silent no-op.

### `#set <name> = <value>`

Assigns a variable. The value runs to the end of the line or to the next tag,
and keeps its spaces:

```
#set generator = on
#set candle = burning bright
Generator online #set generator = on
* Toggle generator #set generator = on
```

- It runs **before** the line it sits on prints, so a `{var}` on that same line
  shows the new value.
- On a **choice** it fires when the choice is picked, which collapses the
  common "choice whose only body is an assignment" into one line.
- On a **block header** it re-runs on every redraw — see
  [Variables](#variables) for why that is usually the wrong place for it.
- A `#set` that is not an assignment (`#set x`, `#set x = `) is an **error**,
  not an inert tag.
- A value may contain spaces, but not `#` or `->` — those end the arguments,
  and escapes do not reach inside them. `#set colour = \#ff0000` does not work.

### `#if <name> = <value>`

Runs the line only when the variable holds that value. On a line of text it
decides whether the line prints; on a choice it decides whether the choice is
**offered at all**:

```
= main
Reactor nominal
ALARM: COOLANT LOW #if coolant = low
* Vent coolant #set coolant = low
* Emergency purge -> purge #if coolant = low
```

The inline divert comes **before** the tags, as it always does. The other way
round, the `-> purge` would be read as part of the value — so the line is
rejected rather than quietly never matching.

- A hidden choice is **gone from the menu**, not blanked — and the choices
  around it keep working, because the runner tracks them by their position in
  the source rather than in the menu.
- On a **divert** it decides whether the story goes there: `-> purge #if
  coolant = low` jumps when it matches and carries on down the block when it
  does not. That is the one way flow depends on state.
- It suppresses **everything else written on the line**, so a `#set` beside a
  false `#if` does not run either.
- An **unset** variable matches nothing — not even the empty string. There is
  no value there to compare against.
- The comparison is exact and case-sensitive: `#if candle = lit` and `#set
  candle = Lit` do not match.
- Not allowed on a **block header**, where suppressing "the screen" has no
  sensible meaning.

There is no `!=`, no `>` and no `or`. If you need the opposite of a condition,
set the variable to both values you care about (`open` / `shut`) and test for
the one you want, rather than testing for the absence of the other.

### `#clear`

Wipes every line off the screen. Applies **before** the line carrying it prints,
so `#clear` on a block header clears, then draws the block.

```
= main #clear
```

### `#title`

Renders the line as a heading (`<h3>`) instead of body text. The theme decides
the decoration: `crt` wraps it as `// GRETA BASE //`, `library` leaves it alone.

```
GRETA BASE #title
```

### `#delay <milliseconds>`

Waits **after** the line has finished typing, before the next one starts. A bare
`#delay` with no argument waits **1500 ms**. Use a number; anything else is not
a duration and behaves as no wait.

```
Generator spinning up... #delay 800
Airlock [closed] #delay
#delay 100
```

### `#speed <milliseconds-per-character>`

Sets the typewriter speed — **higher is slower**. The default is `5`. `#speed 0`
prints instantly.

Unlike the others this is **sticky**: it applies to the line carrying it and to
every line after, until another `#speed` or a restart. Put it on a block header
to pace a whole screen, or on one line to slow a single flourish:

```
= boot #speed 5
......................... #speed 40
```

A line keeps the speed it was printed at, so a later `#speed` cannot retype it.

### `#password <word>`

A **gate**. Execution stops dead at this line: nothing after it runs, no choices
are offered, and the terminal shows an input prompt. The story resumes only when
the player types the word.

```
ENTER PASSWORD #password 123
-> main
```

- The comparison is trimmed and **case-insensitive**.
- The password is a **single token**. `#password two words` takes only `two`;
  whitespace splits arguments, and escapes do not apply inside them, so a
  password cannot contain a space or a `#`.
- A **bare `#password`** with no argument means the empty password — pressing
  Enter on an empty prompt passes. Rarely what you want.
- A wrong answer prints the theme's refusal (`ACCESS DENIED` on `crt`, `The ward
  refuses you.` in the library) and re-offers the same gate, leaving the story
  exactly where it was.
- The theme picks the on-screen keyboard: `crt` asks for a **numeric** keypad,
  `library` for text. On a tablet, keep `crt` passwords numeric.

Because a gate re-runs whenever its block does, `-> boot` from a menu makes the
player re-enter the password — which is usually the point. The same rule bites
on a block *header*: `= main #password 123` re-prompts on every redraw, so every
plain choice on that screen asks for the password again. Gate a block you divert
away from instead.

### `#theme <name>`

Switches the look. Sticky, like `#speed`: it holds until another `#theme` or a
restart. An unknown name falls back to `crt` rather than blanking the screen.

```
= wake #theme library
```

## Themes

A theme is the object the fiction says you are looking at. Two ship today:

| Name | |
| --- | --- |
| `crt` | green phosphor terminal, scan lines, blinking block cursor (default) |
| `library` | a warded book: parchment, leather binding, candlelight, ink |

Beyond the frame, a theme supplies its own wording for the three strings the
terminal produces on its own — the heading decoration, the wrong-password line,
and the end-of-story line. See `src/lib/themes/` to add one; the terminal markup
reads only CSS custom properties, so a third theme is a new directory, not an
edit to `Terminal.svelte`.

## What the format does not have

Deliberately, so you stop looking:

- **No conditions beyond `#if name = value`.** No `!=`, no `>`, no `and` or
  `or`, and no nesting — a condition is one variable against one literal, and a
  line either carries one or it does not.
- **No arithmetic.** Values are strings; `#set n = 1` then `#set n = 2`, not
  `n + 1`.
- **No expressions in `{...}`** — a variable name and nothing else.
- **No functions, includes, or multi-file stories.**
- **No inline styling** beyond `#title`.

Branching is still mostly player-driven: the player picks the choice that
diverts. `#if` narrows what is on offer, it does not run the story on its own.

## Errors

Parse errors are reported per line, with the rest of the story still running.
In the editor they appear as markers in the gutter and in the list below it;
click one to jump to the line.

The parser reports:

- a line matching no form (`= 9lives`, `->`, `* Go #set x = 1 -> there`)
- `Duplicate block name "x"`
- `Unknown block "x"` — a divert whose target does not exist
- ``#set is written as `#set name = value` `` — a tag whose arguments are not
  what it wants: too few, too many, or a missing `=`. Every tag in `tags.ts`
  carries the line quoted back at you here.
- `#title does nothing on a block header` — a tag in a position where it would
  have no effect

The rule behind the last two: a tag the format knows about is never allowed to
sit there doing nothing. Only an unrecognised tag is silently inert.

Two failures surface at runtime instead, on screen:

- `[unknown block "x"]` — a divert that got past the parser; the story halts
- `[story loops forever]` — a divert cycle, cut off after 10 000 steps rather
  than hanging the browser

## Grammar listing

Reproduced from `src/lib/grammar.ohm`, which is the authority — regenerate the
parser with `yarn gen2` after editing it.

```ohm
Terminal {
  line
    = commentLine
    | blockLine
    | choiceLine
    | divertLine
    | textLine
    | tagLine
    | blankLine

  commentLine = indent "//" any*
  blockLine   = indent "=" hs* ident hs* tags
  choiceLine  = indent "*" hs* body divert? tags
  divertLine  = indent divert tags
  textLine    = indent ~("=" ~"=") body tags
  tagLine     = indent tagItem+
  blankLine   = hs*

  divert = "->" hs* ident hs*

  body    = segment+
  segment = escape | interp | chunk
  interp  = "{" hs* ident hs* "}"
  chunk   = (~("#" | "{" | "->" | escape) any)+

  escape    = "\\" escapable
  escapable = "#" | "{" | "}" | "=" | "*" | "-" | "/"

  tags    = tag*
  tag      = "#" ident tagArg* hs*
  tagArg   = hs+ argToken
  argToken = (~(hs | "#" | "->") any)+

  value  = (escape | ~"#" any)+
  ident  = (letter | "_") (alnum | "_")*
  indent = hs*
  hs     = " " | "\t"
}
```

Four pieces are worth knowing when reading it:

- `textLine`'s `~("=" ~"=")` keeps `=== SYSTEM ===` prose while leaving a
  malformed header an error.
- `chunk` has to stop in front of an `escape` as well as in front of `#`, `{`
  and `->`, or `abc\#def` would split in the wrong place.
- **No tag name, and no per-tag structure, appears anywhere in the grammar.** A
  tag is a name and whitespace-separated arguments, full stop — `#set x = 1` is
  three arguments, and the `=` is one of them. Which names are real, how each
  reads its arguments, where each may sit and what each does all live in
  `src/lib/tags.ts`. Adding a tag is an entry in that file and nothing else: no
  rule here, no regeneration.
- `argToken` stopping at `->` is what keeps `#set x = 1 -> there` from
  swallowing an inline divert. It stops at `#` too, which is why a tag's
  arguments end where the next tag begins.

The escapable list is mirrored by `ESCAPABLE` in `Parser.ts`; change both
together.

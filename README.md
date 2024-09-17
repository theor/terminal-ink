# Terminal-Ink

A fake terminal for TTRPGs, scripted with Inkle's [Ink language](https://github.com/inkle/ink). I use it to run [Mothership](https://www.tuesdayknightgames.com/pages/mothership-rpg) sessions.

Demo: https://terminal-ink.netlify.app/#/



https://github.com/user-attachments/assets/8a5d774f-929a-469a-a3ba-9eb2cf37c7f7



# Usage

The most flexible option is to run a dev server on a machine, then access it from adevice on the game table (iPad, phone, ...). It allows to update the content live.

- clone
- yarn && yarn dev
- edit the `story.ink` file as needed

# Ink tags
custom ink tags with an effect:
- `#speed <number>` changes the speed of the typewriter effect - the higher, the slower
- `#delay <milliseconds>` will wait for the provided duration - defaults to 1500
- `#title` to output a header
- `#password <digits>` to prompt for a password (digits only for now)

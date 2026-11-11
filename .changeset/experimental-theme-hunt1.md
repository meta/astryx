---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: data safety and value checks.

- A refused change puts back only the files that command wrote in that run, each whole, and only while they still hold what it wrote; a file changed by someone else meanwhile, or one it cannot restore, is left and named. The settings and undo history are written inside that rollback, and a refused `new` leaves no trace. A link anywhere in `themes/` or the theme folder is refused, and never followed or removed. A palette.config.json the editor did not write is kept. `show` finds a build that does not match the settings (a command stopped mid-build, a hand edit) and builds it again, saying so. Temp files have their own editor names and are removed by the write that made them; nothing else is ever removed. Run from a subfolder, a command acts on the Astryx project above it, found as `upgrade` finds it: the search stops at a repository root and never takes the home folder. A package without Astryx inside that project is refused with the folder to run from, a package.json that does not parse is never walked past, and reply paths are absolute when the project is above the current folder. Yarn Plug'n'Play and a package.json without Core get their own messages. A full or read-only disk is `ERR_WRITE_FAILED`.
- Commands on one theme run one after the other, so no change is lost. The lock lives in the project's `node_modules/.cache` (a folder that cannot be written is refused with `ERR_WRITE_FAILED`); a lock left by a stopped command, or by one on another computer that stopped, is taken over. A command that waits more than 30 seconds is refused with the new code `ERR_THEME_BUSY`, naming the lock.
- Every name the name check accepts builds (`brand-2`). Names are at most 64 characters. `new` refuses a link or a file where the theme goes, a stray word, a flag given two values, and an empty `--like`; `--headings` takes a weight and a tracking; a refused flag suggests a `new` command.
- Settings edited by hand are checked on load, and so is the step `undo` goes back to. A saved value the editor no longer accepts names the `undo <theme> <thing>` that removes it, and that command works; a step `undo` goes back to that holds one is passed with that value left out, and the result says so. A damaged undo step drops only itself and the steps before it. A quoted string or a data URL may hold a semicolon.
- Token values are checked by their type: time, easing, font, shadow and outline style too, and heading weights as numbers. A value that would break the CSS, read itself, or name a placeholder such as `<color>` is refused. Only colors take `--mode`; a shadow per mode would remove it in both.
- Code highlighting, display text sizes and colored icon tokens can be set.
- An exact font family applies on phones too; phones keep their own reading sizes.
- A text size or type scale keeps the base theme's ratio and the theme's heading weights (an exact weight token still feeds them), on phones too.
- `text-size` takes 10 to 32 pixels. `font` refuses values that would not build. `vibrancy` is refused when every color is a gray.
- `undo <theme> <token>` names the dial that still writes the token.
- Reading a built theme writes no copy into the theme folder.

@josephfarina

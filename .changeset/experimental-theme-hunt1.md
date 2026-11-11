---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: data safety and value checks.

- A refused change puts back only the files the editor writes, each whole, and goes on past a file it cannot restore, naming it. The theme's own source and any other file in its folder are never touched. The settings and undo history are written inside that rollback. A theme folder, `themes/` or settings file that is a link is refused. Run from a subfolder, a command acts on the nearest package; a package without Core inside an app with it is refused with the folder to run from, and a package.json that does not parse is never walked past. A full or read-only disk is `ERR_WRITE_FAILED`.
- Commands on one theme run one after the other, so no change is lost. A command that waits more than 30 seconds is refused with the new code `ERR_THEME_BUSY`; a lock left by a stopped command is taken over.
- Every name the name check accepts builds (`brand-2`). Names are at most 64 characters. `new` refuses a link or a file where the theme goes, a stray word, a flag given two values, and an empty `--like`; `--headings` takes a weight and a tracking; a refused flag suggests a `new` command.
- Settings edited by hand are checked on load, and so is the step `undo` goes back to. A value the editor no longer accepts names the `undo <theme> <thing>` that removes it, and that command works. A damaged undo step drops only itself and the steps before it. Leftovers of a stopped command are removed at the next start. A quoted string or a data URL may hold a semicolon.
- Token values are checked by their type: time, easing, font, shadow and outline style too, and heading weights as numbers. A value that would break the CSS, read itself, or name a placeholder such as `<color>` is refused. Only colors take `--mode`; a shadow per mode would remove it in both.
- Code highlighting, display text sizes and colored icon tokens can be set.
- An exact font family applies on phones too; phones keep their own reading sizes.
- A text size or type scale keeps the base theme's ratio and heading weights.
- `text-size` takes 10 to 32 pixels. `font` refuses values that would not build. `vibrancy` is refused when every color is a gray.
- `undo <theme> <token>` names the dial that still writes the token.
- Reading a built theme writes no copy into the theme folder.

@josephfarina

---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: data safety and value checks.

- A refused change puts every file of the theme back as it was, and never removes a folder or link it did not make. Run from a subfolder, a command acts on the app that declares Core.
- Commands on one theme run one after the other, so no change is lost. A command that waits more than 30 seconds is refused with the new code `ERR_THEME_BUSY`.
- Every name the name check accepts builds (`brand-2`). Names are at most 64 characters. `new` refuses a link or a file where the theme goes, a stray word, a flag given two values, and an empty `--like`; `--headings` takes a weight and a tracking; a refused flag suggests a `new` command.
- Settings edited by hand are checked on load, and so is the step `undo` goes back to.
- Token values are checked by their type: time, easing, font, shadow and outline style too, and heading weights as numbers. A value that would break the CSS, read itself, or name a placeholder such as `<color>` is refused. Only colors take `--mode`; a shadow per mode would remove it in both.
- Code highlighting, display text sizes and colored icon tokens can be set.
- An exact type token applies on phones too.
- A text size or type scale keeps the base theme's ratio and heading weights.
- `text-size` takes 10 to 32 pixels. `font` refuses values that would not build. `vibrancy` is refused when every color is a gray.
- `undo <theme> <token>` names the dial that still writes the token.
- Reading a built theme writes no copy into the theme folder.

@josephfarina

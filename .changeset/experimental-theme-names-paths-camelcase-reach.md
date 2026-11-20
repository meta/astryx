---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: names, damaged themes and stops.

- A theme name typed as a path (`themes/brand`, `./t`, `t/`) names the theme it ends in, and says when that theme is here already; a typo of a theme name offers the nearest theme by spelling first (`brand-drak` is `brand-dark`, not `brand`), and a camelCase name is the dashed one (`brandDark` is `brand-dark`, `themePark` is `theme-park`), never a new theme.
- A refusal names a command that works: `undo` on a theme whose settings cannot be read and that has no history names `new <theme>`, not `show`; a damaged mode or base no longer sends each fix to the other (changing or removing a setting puts the field back to its default and says so); a settings entry with no thing or no source is damage `new` keeps aside, as the refusal says.
- A folder holding only `desktop.ini` is empty, like one holding only `Thumbs.db` or `.DS_Store`.
- An `undo` that switches the theme between one mode and both names the app's `<Theme mode>` to add or take out, as `set mode` does; `undo --help` says `--mode` removes a setting saved for one mode in a one-mode theme.
- Stopped (Ctrl-C) while the checks and pictures run after a change, the editor says the change is saved and built and that `show` runs the rest.

@josephfarina

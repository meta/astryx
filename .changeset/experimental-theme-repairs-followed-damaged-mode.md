---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: repairs work when followed. A damaged mode or base with a second bad value in the list leads with the fix for that value, which also saves the mode or base as meant, and no repair offers a bare `undo` that would throw away the last change. A stored vibrancy is offered as a set only when a color dial is set, and the no-effect refusal names a token color as one vibrancy does not change. `undo` with a theme name typed in another form (`tTheme`, `T`, `brand_dark`) suggests the same undo with the theme's name. A missing name with a doubled or trailing dash suggests the cleaned name that `new` takes. The tracking half of headings listed twice is undone with `undo <theme> headings tracking`, the form that works. A trailing comma or a typographic dash in `--on` (`text-input,`, `text–input`) names that part, never its whole group. A light and dark color pair on `new` offers the user's own colors per mode, never a stock color. In a one-mode theme, a doubled entry for its own mode is kept with that `--mode`, which now replaces both entries.

@josephfarina

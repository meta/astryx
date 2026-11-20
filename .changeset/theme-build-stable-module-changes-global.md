---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`:

- A plain-object theme (`export default {name, tokens}`) goes through `defineTheme` as a `defineTheme(…)` call does: a `[light, dark]` pair is written as `light-dark()`, and Core's media-surface rules are written. One with `extends` and no tokens builds as the empty theme over its base.
- A spread of a package theme (`{...neutralTheme, name}`) is refused naming the spread and the form that builds (`extends: neutralTheme`), not an `icons` field the file does not set.
- A stylesheet the theme source imports (`import './brand.css'`) is named in a warning: the built outputs do not carry it, so the app imports it.
- What a theme module changes while it loads in `console`, a global (`Buffer`) or the file mode mask is put back when the load ends, so the command prints its result and writes readable files.

@josephfarina

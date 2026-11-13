---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a `dark-only` or `light-only` theme keeps both halves of its colors, and its mode is the one the app's `<Theme>` is given.

- The theme's colors keep their light and dark values, so a toast, a lightbox or an overlay Core draws in the other mode stays readable; the generated settings module carries only names Core's types take, so the app type-checks.
- `set <theme> mode dark-only` (or `light-only`) says to give the app's `<Theme>` `mode="dark"` (or `"light"`), and the wiring after `theme add` says where it goes; the preview passes it already.
- Settings for the other mode stay out of a one-mode theme and are named, as before.

@josephfarina

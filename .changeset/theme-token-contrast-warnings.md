---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` and `astryx doctor` now warn when a theme's own color tokens give text below 4.5:1, however the theme was written: a hand-written theme that sets `--color-neutral` to one light gray for both modes, for example, gives a dark segmented control near-white labels on a light track. The measurement is the one the theme editor's check uses for a setting, and each warning gives a plain fix (the token, where to set it, the mode and a value that reads). The warnings never change `theme build`'s exit status or fail `doctor`; doctor reports them in a `theme-contrast` row. Component rules in hand-written themes aren't measured yet, only their color tokens.

@josephfarina

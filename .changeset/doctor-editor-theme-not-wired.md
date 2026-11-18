---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` no longer reports a theme as wired because a theme source or a generated theme file imports it: the theme editor's settings module, a theme build's output, or a theme source that imports a package theme only to extend it. Before, an editor theme built on an installed theme package (`--like <theme>`) turned the "no theme appears wired" warning into a pass while the app rendered no theme; now only the app's own imports of a theme, or a theme it passes to `Theme`, count.

@josephfarina

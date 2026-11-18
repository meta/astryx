---
'@astryxdesign/cli': patch
---

[experimental] `astryx search` no longer lists icons for an `icon` or `icons` right after `with` (only `a`, `an` or `the` between) when its results hold a component or template: `card with an icon` answers the card alone. An icon described after `of` or `for` (`card with an icon of a star`), or named before the word (`button with plus icon`), still lists the icons that answer it.

@josephfarina

---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: "a little more space between list items" (more room between the items of a part, with no amount) moves that part's own gap to the next stop up the theme's spacing scale (`gap var(--spacing-1) --on list` from a gap of `--spacing-0-5`), instead of only naming the gap. "less" or an amount of the gap such as "double" still asks for a value; a length ("12px") is written as given.

@josephfarina

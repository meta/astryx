---
'@astryxdesign/cli': patch
---

[fix] `astryx search` reads a docs namespace page at the reader's grain. A word the page's text shares with a doc beneath it, which that doc answers at least as strongly, is that doc's evidence, so a namespace page that sums up its guides no longer ranks above the components, templates, hooks and guides it summarizes. Words only the page carries, and its name, title, description and declared keywords, still match it. `build` is unchanged.

@josephfarina

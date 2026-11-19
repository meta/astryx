---
'@astryxdesign/cli': patch
---

[perf] `search` answers sooner: a name or keyword word that starts with another letter than a query word is no longer expanded into its plural and stem forms to compare them, since every form of a word keeps its first letter, and an entry's description words are read only when a spelled-out name needs them. Output is unchanged.

@josephfarina

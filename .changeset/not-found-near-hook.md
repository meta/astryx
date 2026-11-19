---
'@astryxdesign/cli': patch
---

[feat] When `astryx component` or `astryx template` finds no entry, the not-found error also points to a hook the name nearly spells or names by meaning. A `use…` name one or two slips from a hook's name, or one whose every word that hook's name carries (`useTableExpansion` for `useTableRowExpansion`), suggests that hook (`astryx hook <name>`). For `astryx component`, a name of two or more words that are exactly a keyword one hook's doc declares (`CopyButton` for a hook whose doc lists `copy button`) suggests that hook. The hint goes first only when no own suggestion matches as well: a suggestion whose name nearly spells the typed name or carries every typed word, or a component whose doc keywords or search-card synonyms hold the same phrase, stays ahead of it. The list never grows, the lookup still fails, and a name that already matches another command's entry by name keeps that hint.

@josephfarina

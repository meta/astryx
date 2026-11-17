---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental icon` answers a query of several words that no icon matches as a whole, such as a glyph named in a phrase with the control around it. Icons that carry some of its words come back as word matches (score 20), the project's set first and, within a set, the icon carrying the rarest words first; a word that names a definition the set maps an icon for counts twice for that icon, and a word no icon carries counts for nothing. Word matches appear only in the search's own answer, and only where nothing answered before. A word written as an export name (`SearchIcon`, `ChevronDownIcon`) is also read as its words; the reading with the better-scoring match answers, so an answered query changes only when the split reading finds a better match.

@josephfarina

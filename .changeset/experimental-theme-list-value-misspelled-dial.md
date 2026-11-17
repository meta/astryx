---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a list value with one item misspelled, for a dial that takes each word alone (`set t headings 'blod tight'`), gets a line for each word, as each word alone does; and `undo` reads three or more bare words as a list of settings only when every word names a setting, so `undo t font Inter Tight` is a setting and its value again.

@josephfarina

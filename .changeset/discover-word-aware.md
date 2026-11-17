---
'@astryxdesign/cli': patch
---

[feat] `astryx discover <words>` matches word by word, as `astryx search` does: an item matches by the words of its name (camelCase split), title, summary, and keywords, and its package's description adds words, so `discover bar chart` finds `BarChart`. When an item matches every word, only such items are listed; matches rank by how many words they match. When nothing matches, the error suggests the Core component or hook `astryx search` gives first for the query, such as `astryx component AlertDialog` for `discover modal`. `astryx search` now prints its "More in packages you could add" line only when the saved copy of a discover catalog has a package the project could add with an item that carries a word of the query; with no saved copy, the line prints as before. Search reads only the saved copy and never calls a discover source.

@josephfarina

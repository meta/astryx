---
'@astryxdesign/cli': patch
---

[feat] `astryx discover <words>` matches word by word, as `astryx search` does: every word is part of the query, and an item matches by the words of its name (camelCase split), title, summary, and keywords, with its package's description adding words. So `discover chart categories` finds a `BarChart` whose summary says "Compare values across categories", which the old whole-phrase match missed. When an item matches every word, only such items are listed; matches rank by how many words they match. When nothing matches, the error suggests the Core component or hook `astryx search` gives first for the query, such as `astryx component AlertDialog` for `discover modal`, when search matches it by name or keyword. `astryx search` now prints its "More in packages you could add" line only when the `discover` command it names would list a match: discover's own search, run over the saved copy of a discover catalog, decides. With `--type <kind>`, the line names `discover <query> --type <kind>`. With no saved copy, the line prints as before. Search reads only the saved copy and never calls a discover source.

@josephfarina

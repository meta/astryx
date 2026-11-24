---
'@astryxdesign/cli': patch
---

[fix] `astryx search` counts a query word of 3+ letters that is a whole word of a component's or hook's name as a name match, however short the word is against the name: `list of details` now leads with MetadataList, and `power` with PowerSearch. Such a word can add an entry to the answer, and `rankSearchIndex()` answers the same way. A hook's leading `use` and template names keep today's name rule, and `astryx build` ranks as before.

@josephfarina

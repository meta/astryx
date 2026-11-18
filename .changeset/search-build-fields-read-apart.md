---
'@astryxdesign/cli': patch
---

[fix] `astryx search` and `astryx build` read a doc's name, title, description and each keyword on their own, so no word pair spans two of them. A sentence of unknown words added to a description no longer moves search results two to ten or changes the blocks build suggests. Build's checked-in, tunable matcher weights are refit to this reading.

@josephfarina

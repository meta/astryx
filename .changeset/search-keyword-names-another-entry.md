---
'@astryxdesign/cli': patch
---

[fix] `astryx search` no longer counts a component or hook keyword that is another entry's name as a match for that entry, so `spinner` lists Spinner without NumberInput beside it. A keyword still counts when the entry's own description uses the word, or when it names the entry's own family member or its hook. `build` reads keywords as before.

@josephfarina

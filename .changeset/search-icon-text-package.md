---
'@astryxdesign/cli': patch
---

[experimental] `astryx search`'s icons block names a set two installed packages ship with its package (`trash (@acme/glyphs/glyphs): …`), as the JSON `name` does, so the two lines no longer read the same. A set no other package ships prints as before.

@josephfarina

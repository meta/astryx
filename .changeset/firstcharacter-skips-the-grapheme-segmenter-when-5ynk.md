---
'@astryxdesign/core': patch
---

[fix] firstCharacter skips the grapheme segmenter when the first code unit is below U+0300 and not CR, and the next code unit is absent or also below U+0300, so Avatar initials for most Latin-script names no longer pay for a segmenter pass per word. Results are unchanged.

@harjothkhara

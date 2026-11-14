---
'@astryxdesign/core': patch
---

[fix] firstCharacter skips the grapheme segmenter when the first character is a single code unit below U+0300, so Avatar initials for plain Latin names no longer pay for a segmenter pass per word. Results are unchanged.
@harjothkhara

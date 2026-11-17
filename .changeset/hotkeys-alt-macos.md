---
'@astryxdesign/core': patch
---

[fix] `useHotkeys`: an `alt` combo such as `'alt+a'` or `'alt+1'` now fires on macOS. Option changes the character a key types there (Option+A types "å", and some keys are dead keys), so the combo never matched. When Option has rewritten the character, the combo matches the key's physical position. A key that types a plain character still matches by the character, so other keyboard layouts behave as before, and shortcuts stay silent in text fields.

@cixzhang

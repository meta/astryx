---
'@astryxdesign/core': patch
---

[fix] `useHotkeys`: an `alt` combo such as `'alt+a'` or `'alt+1'` now fires on macOS. Option changes the character a key types there (Option+A types "å", and some keys are dead keys), so the combo never matched. On macOS, when Option has rewritten the character, the combo matches the key's US position, whatever the keyboard layout: on an AZERTY Mac, Option plus the key labeled A fires `'alt+q'`. Name shifted punctuation as `'alt+shift+/'`, not `'alt+?'`. Other platforms are unchanged, and shortcuts stay silent in text fields.

@cixzhang

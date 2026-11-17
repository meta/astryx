---
'@astryxdesign/core': patch
---

[fix] `useHotkeys`: an `alt` combo such as `'alt+a'`, `'alt+1'` or `'alt+space'` now fires on Apple platforms: macOS, and iPadOS or iOS with a hardware keyboard. Option changes the character a key types there (Option+A types "å", and some keys are dead keys), so the combo never matched. There, when Option types a dead key or a non-ASCII character, a combo with a letter, digit, punctuation or space key matches that key's US position, whatever the keyboard layout: on an AZERTY Mac, Option plus the key labeled A fires `'alt+q'`. When Option types a plain ASCII character, the combo matches that character: a German Mac types "@" for Option+L, so it fires `'alt+@'`. On Apple platforms, name shifted punctuation as `'alt+shift+/'`, not `'alt+?'`. Windows, Linux, ChromeOS and Android are unchanged, and shortcuts stay silent in text fields.

@cixzhang

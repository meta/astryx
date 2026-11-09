---
'@astryxdesign/core': patch
---

[fix] MultiSelector: opening the closed list never highlights a disabled option. ArrowDown, Enter and a press highlight the first enabled option, and ArrowUp the last enabled option, so Enter no longer lands on an option it cannot toggle.

@cixzhang

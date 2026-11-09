---
'@astryxdesign/core': patch
---

[fix] MultiSelector: opening the closed list never highlights a disabled option. ArrowDown, Enter, Space and a press highlight the first enabled option in the order the list opens in, and ArrowUp the last, so Enter no longer lands on an option it cannot toggle. A list with search still highlights nothing when a press or Enter opens it.

@cixzhang

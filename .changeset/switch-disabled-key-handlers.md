---
'@astryxdesign/core': patch
---

[fix] A disabled `Switch` no longer runs a caller's `onKeyDown` or `onKeyUp` (`spec:AST-085` FR2). Before, the switch stayed focusable through `aria-disabled` instead of native `disabled`, so a key pressed on it still reached those handlers, while its `onClick` was already withheld. It still refused to toggle. An enabled switch is unchanged: its key handlers still run.

@parinith-web

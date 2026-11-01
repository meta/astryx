---
'@astryxdesign/core': patch
---

[chore] AppShell drops an unmount Effect that repeated the release main's ref already performs; main's overflow observation and keyboard delegation are still released on unmount. No behavior changes.

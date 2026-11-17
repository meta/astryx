---
'@astryxdesign/core': patch
---

[fix] The useHotkeys docs no longer recommend `shift+/` for a help overlay. The hook compares the final key against `event.key`, and Shift+/ produces `?` on US layouts, so a `shift+/` registration never fires there. The docs now use `?` and say to register a punctuation key that shift changes as the character it produces. No behavior changes.

@josephfarina

---
'@astryxdesign/core': patch
---

[chore] Internal: the undocumented `@astryxdesign/core/internal/line-clamp` entry gives Lab's `LineClamp` Core's focusable selector, the shared mutation observer and its flush, and the shared truncation tooltip. The shared mutation observer now passes each registration the records that reached it, and existing callers ignore them, so their behaviour is unchanged. Internal entries are outside the public API and its compatibility promise.

@HelloOjasMutreja
@cixzhang

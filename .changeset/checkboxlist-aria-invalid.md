---
'@astryxdesign/core': patch
---

[fix] A `CheckboxList` with an error `status` now makes every checkbox `aria-invalid`, so a screen reader announces the list as invalid as each checkbox takes focus, as it already does for `RadioList` and `Switch`. The message still renders once, from the list.

@cixzhang @duytbp

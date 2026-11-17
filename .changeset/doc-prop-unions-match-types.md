---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] Text's `as` docs list `h1`, `h2` and `h3`, and PowerSearch's `statusVariant` docs list `tooltip`, as their types already allow; the `tooltip` text says what PowerSearch shows for it.

[fix] `astryx doctor integration components` no longer reports a documented string union that leaves out a value the code marks `@deprecated` in every place the type takes it from.

@josephfarina

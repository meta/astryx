---
'@astryxdesign/core': patch
---

[perf] A `List` that is not given an `animatedLayout` handle, and so every `CheckboxList`, no longer loads the row layout animation. A page with a list loads about 28–32 KB less JavaScript before first paint (about 10–11 KB gzip). The handle from `useAnimatedLayout` now carries the calls a List makes, so a List given a handle animates its rows as before.

@duytbp @cixzhang

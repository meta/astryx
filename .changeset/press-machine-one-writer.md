---
'@astryxdesign/core': patch
---

[chore] One press machine and one press paint. The touch press controller behind `usePressFeedback` and every other painter write `data-astryx-press` through one internal writer in `utils/pressFeedback.ts`: the gesture system's internal delegated press consumer is removed (no component used it, and no package entry point exported it), and its press painter moves there.

@vjeux

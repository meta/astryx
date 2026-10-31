---
'@astryxdesign/core': patch
---

[fix] `Avatar`: initials at a named `size` (`xsm`/`sm`/`md`/`lg`/`xl`) now render at the nearest real type-scale step instead of an off-scale value from the `size × 0.4` proportional ratio.

That ratio lands between type-scale steps at every named tier — `sm` (24px) produced 9.6px, `md` (36px) produced 14.4px, `lg` (48px) produced 19.2px — sizes nothing else in the system ever renders text at, and `xsm` (20px) produced 8px, below the smallest step in the scale. A caller-supplied numeric `size` outside the named tiers keeps the proportional ratio, since there's no type-scale step to snap an arbitrary pixel value to.

@HelloOjasMutreja

---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` and `astryx experimental theme` judge the shape of a typography block by what Core reads:

- a type scale with no base or ratio, or one that is no block, which builds every size as NaNrem;
- a role or a typography given as a plain value, which builds nothing;
- a heading `weights` that is no block of levels, which Core reads letter by letter;
- one heading level written twice (`'01'` and `1`), where Core keeps one.

Without a type scale, any role weight gets the no-scale reason, and an empty weight is named as skipped. A boxed value is judged as its primitive, a signed number weight (`-100`) is read as written, and a plain-object theme is judged on the values it loads.

@josephfarina

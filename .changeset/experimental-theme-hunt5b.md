---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: review follow-ups.

- A corners step on a part moves to the next rung that part shows bigger or smaller, counting a group setting that covers it, and `show` reports the radius the build writes.
- CSS values are checked against the property's grammar, so valid values such as `12pt`, `stretch` and `env()` are taken, a value that is only a `var()` is taken on any property, and values the browser would drop are refused, with a value that works.
- A color set for one mode on a part keeps the base theme's own value in the other mode. Text contrast reads the same values.
- Every saved setting the editor no longer accepts is named, and each suggested undo works while the others are still saved.
- The CLI now depends on `css-tree` for these checks. It adds about 2.09 MB unpacked to the install (css-tree 1.36 MB and its `mdn-data` 0.73 MB), and loads only when the editor checks a CSS value; no other command loads it, and startup is unchanged.
- `show` suggests installing React only when React is missing, and the busy message says how long the other command has held the lock.

@josephfarina

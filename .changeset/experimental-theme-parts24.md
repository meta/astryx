---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: shorthands by what they set, and part values Core can carry.

- A shorthand set after its longhands replaces only the longhands it really sets, read from MDN's data (`overflow` keeps `overflow-wrap`, `transform` keeps `transform-origin`, `flex` keeps `flex-direction`), and a part's `background` keeps reaching its variants when `background-blend-mode` comes later.
- A group's shorthand replaces its members' longhands as a part's does, so the later setting wins either way.
- On a part whose padding Core writes one variable per side (card), a variant's padding after a side set for every variant is refused, with the commands that work: it would not show.
- `--on cards`, `dialogs`, `tabs` and other plurals name the part, with the set command.
- Word hints keep the value given: `shadow none` is `box-shadow none`, `rounded 8px` is `corners 8px`, `bold false` is `font-weight normal`.

@josephfarina

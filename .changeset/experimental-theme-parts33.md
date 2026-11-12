---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: padding sides and inner radii that win as written.

- A later `padding-inline` replaces an earlier `padding-left` (read as its logical side, left-to-right), and a later part padding replaces a side its group set.
- A part's own multi-value radius keeps the content's radius it gives over a single radius from a group, a dial or the base theme's lifted onto a variant.
- On chat-composer, dropdown-menu, context-menu and segmented-control, one logical padding side (`padding-inline-start`) is written as its physical side, so it changes that side only.
- `initial` and `unset` on one logical padding side of a card or dialog are 0, as on the other padding properties.

@josephfarina

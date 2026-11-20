---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`:

- A text part colored like a filled part uses the fill it shows: "the headings the color of the danger buttons", "the links the same color as the danger buttons". A named paint like "the error inputs' border" uses that paint.
- "the transparent buttons" means the button variant drawn with no fill, not a fill to remove.
- A role the part doesn't have ("the success toasts", "the selector's primary variant") gets a "no such type/variant" answer instead of changing every one.
- "transparent by a quarter" and "a quarter more transparent" on a part keep three quarters, and "the text fainter" works theme-wide.
- The focus ring of one variant stays on that variant.
- Two exceptions joined by "and" ("except the disabled ones and the error ones") keep each one.

@josephfarina

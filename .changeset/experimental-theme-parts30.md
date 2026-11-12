---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: variant values win over lifted base values, and card padding sides and keywords written exactly.

- A part's base value lifted onto a variant (so Core's own variant rule does not hide it) now goes before the variant's own declarations, so a longhand or shorthand set for the variant wins (`border-color` for the destructive button after a base `border`).
- On a part whose padding Core writes one variable per side (card), `padding-left` and `padding-right` go to its side variables (left-to-right), so a later padding replaces them as it does the other sides.
- `padding initial` and `unset` there are 0; `inherit` is refused with a reason, since Core's variables have nothing to take it from.

@josephfarina

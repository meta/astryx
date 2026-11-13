---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: variant values win over lifted base values, and card padding keywords written exactly.

- A part's base value lifted onto a variant (so Core's own variant rule does not hide it) now goes before the variant's own declarations, so a longhand or shorthand set for the variant wins (`border-color` for the destructive button after a base `border`).
- `padding inherit` there is refused with a reason, since Core's variables have nothing to take it from.

@josephfarina

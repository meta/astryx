---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: one-mode colors in a variant or a state, gradient layers with a color, keywords with a mode, and the corners dial on parts with their own radius.

- A one-mode color in a variant or a state (a heading level, a hover) keeps the theme's own value around it in the other mode: the variant's resting color, then the part's, then the whole theme's, as the theme finally has it. A later brand color reaches the other mode.
- In a one-mode background, a color written beside a gradient (`#f00 linear-gradient(…)`) is that mode's background color, and the gradient its image.
- A CSS-wide keyword (`unset`, `inherit`) takes no `--mode`; the offered command sets it for both modes.
- The corners dial reaches parts whose base theme gives them a radius of their own, and a corners step on a part starts from the radius the part shows.
- A one-mode color on a part says that, in the other mode, it overrides what Core or the base theme gives the part in context.
- `how` lists the margins a part reads among its spacing, as `set` reads them.

@josephfarina

---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: state settings keep the base theme's other state styles, one-mode halves across the background family and states, and one-mode tokens that are no color.

- A state setting (a hover text color, say) keeps the base theme's other styles in that state, such as a variant's own hover background, in both modes.
- A one-mode color in a state keeps, in the other mode, what that state shows there: its own value, else the resting color a setting gives the variant or the part, else the base theme's.
- `background` and `background-color` count as one property for one-mode settings: a variant's earlier color is kept as the other half and replaced, and a later both-mode color replaces a one-mode one of the other name.
- A one-mode color in a state is accepted where the base theme gives the part that color.
- In a `light-only` or `dark-only` theme, a token that is no color (a shadow) is written as one value, never as a light and dark pair.
- When `--mode` is refused in a one-mode theme, the offered command keeps `--when` and `--state`, and offers `mode both` first for the mode the theme does not show.
- The spacing dial reads kept sizes in pt, pc, in, cm, mm, Q and em, in any letter case, and keeps a variant's own exact size in order on that variant.

@josephfarina

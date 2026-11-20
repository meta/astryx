---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a repair's offered value reads the whole typed value, never a subset of its words. A line may carry part of the value only when the refusal's other lines carry the rest (`Inter 600` gives the family and the weight, `italic bold` on a part gives the style and the weight); a part alone (`all` for `all 200`, `bold` for `extra bold`, `5` for `0,5`) is not offered.

- A comma between digits is a decimal point (`1,5rem` is 1.5rem, `0,5` is 0.5), or before three digits after a whole number a thousands mark (`1,000` on a weight is 1000), never a split into layers.
- Several values of one kind for a property that takes one offer the first as typed, with px only when the property takes no bare number (`line-height 1.5 2` is 1.5), and never one value of a shorthand of several kinds (`transition all 200` gets `how`).
- `headings extra bold` offers heavy (800), and `text-size x-large` offers 24, the size CSS gives it.
- `more` or `less` authorizes a computed value only on a dial with a scale: a token, a part property or a dial's other name given a step gets `how`, never a stock color, weight or size.
- A saved value authorizes only a keep line for its own setting, never the setting being typed, so `base buter` no longer offers the base the theme already has.
- A light and dark pair on a part's color in a one-mode theme gives the half that theme shows, as a token does.
- The note about a second pasted declaration names its line only when `set` takes it, or the line `set` offers for it.

@josephfarina

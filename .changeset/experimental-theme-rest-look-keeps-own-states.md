---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a resting look keeps what the theme sets for a part's own states. A resting background shorthand gives a part's hover and press layer back from Core under Core's own conditions: no press layer on a disabled part, no hover layer left on a touch screen after a tap, and a combined `--when` scope (`variant:ghost+size:sm`) keeps both; a hover or press background the theme sets for that scope or a wider one, or, under a resting background with no `--when`, for one variant (a ghost button's hover gradient), stays as set in any order. A large or raised button (`--when size:lg`, `--when elevation:high`) gets its hover and press back too. A focus outline property the theme sets (`outline-color … --state focus-visible`, for the whole part or for one variant) is kept under a resting `outline none`, including one scoped to that variant and a size, and Core's focus outline style and width still come back, so keyboard focus stays visible. A state the theme sets for one mode keeps that mode only; the other mode still gets Core's back.

@josephfarina

---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: squaring the pills (`--radius-full 0px`, what "no rounding anywhere" and the square-corners note write) keeps the radio marks round: a radio's circle is what it is, not a corner, so its token stays at Core's value there. The "thick borders on everything" answer and a whole-theme `--border-width` also reach a framed control (a segmented control), the parts that draw a box only when selected (nav items, segments), on that state, and the indicator lines (a tab's underline), at the border width.

@josephfarina

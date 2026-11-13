---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: every `set` a refusal suggests is now checked the way `set` checks it, without writing anything, and a suggestion `set` would refuse is left out. Suggestions carry what was asked instead of a fixed example. `headings light --on heading` offers `headings light` and weight 300 on one level. `text-size large --on card` offers that size on the card. A number token reads the number meant (`700px` is 700, `1,5` is 1.5, `calc(1rem+2px)` gets its spaces). A word dial given a number offers its own words, or the nearest `type` preset for a scale ratio. An invalid color is never copied into the text color token. A color property refuses a `var()` fallback inside `color-mix()` that is not a color. `how "more washed out colors"` lowers vibrancy.

@josephfarina

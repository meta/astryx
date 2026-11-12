---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: number words, typed token names and states worded as actions.

- Numbers written as words are read: "zero radius everywhere" is square, "twelve pixel corners" 12px, "a two pixel border" 2px, "forty pixels tall", "a quarter rem", "one and a half line height".
- "least", "minimum", "as little as possible" and "barely any" mean less; "maximum roundness" is a pill.
- A token typed by name with a value ("--focus-outline-width: 3px", "--color-background-card to #fafafa in light mode") is set exactly. A token name that does not exist is refused with the nearest names, never answered with another token.
- States worded as actions keep the state: hover, click and press (active), typing and tabbing to (focus), "after I check" (checked), "picked" (selected). "Tab to" no longer names the tab part, and a link's color in one state is set for that state.
- "Cards the same radius as buttons" gives cards the token buttons read; "buttons twice as round as inputs" changes buttons; "the same color as the danger color" uses that color's token.
- "Shouldn't links be underlined?" asks for the underline.
- A pasted `h1, h2, h3 { … }` includes h1.

@josephfarina

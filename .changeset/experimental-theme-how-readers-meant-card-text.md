---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads more asks as meant:

- "the card text 30% fainter" lowers it by 30%.
- "twice as short", "half as tall" and "twice as tall" change each height the part reads by that amount, instead of one spacing step.
- "expanded" means the part's expanded state, and "pressed" a toggle button's pressed state (a button's press is still its active state).
- "what is the height of buttons?" and "how tall are the buttons?" are answered.
- "the button corners twice as tight" changes only the corners.
- An exact border width ("half as thick") leaves the borderless styles borderless, as "thinner" does.
- A mode with a typo that keeps its letters is read wherever a mode is named: "in drak mode", "ligth theme", "(drak)", "[dark only]".
- Typed tokens each with their own direction ("--color-accent darker and --color-error darker") work.

@josephfarina

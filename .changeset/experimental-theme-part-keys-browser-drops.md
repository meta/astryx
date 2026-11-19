---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`:

- A part key the build cannot write as intended is refused at its line in an editor theme: a vendor property written without its dash (`msOverflowStyle`, `webkit-transform`, with the dashed form offered), a pseudo name in capitals (`':HOVER'`, which Core does not read as `:hover`), something after a pseudo-element (`'::before:hover'`, with `':hover::before'` offered), two pseudo-elements, an escaped pseudo name, the custom property `--`, an empty key, and a block under a key that nests none (`'[data-x'`, a pseudo key inside a pseudo key). A plain theme's `compile` warns them, as `theme build` does.
- A custom property of the theme's own whose value is a `var()` that reads nothing is refused at that property, as the same `var()` is in a part's property.
- A value passed to an imported function (`make('nope')`) is blamed on the line that passes it; a value read through an optional chain (`all?.toks`) or an export that is a property of another block in its file is blamed on the line that holds it.
- NaN and Infinity get no example made from them (no `'NaNpx'`).

@josephfarina

# Palette authoring agent test

This focused prompt set checks whether an agent translates ordinary author
language into the intended palette-generation controls.

Run each entry in `prompts.json` with a fresh agent that can discover the
shipped CLI docs. Keep `expected-decisions.json` hidden until scoring so the
agent cannot see the answer key.

Evaluate whether the response:

- selects `exact`, `bounded`, or `flexible` from the author's stated intent;
- changes vibrancy only when requested;
- preserves explicit custom and decimal stops;
- includes default black and white endpoints unless the author removes them;
- omits an accent when none is requested;
- asks whether an ambiguous accent is one theme value or a generated family;
- generates an `accent` family only when a ramp is explicitly requested.

Passing requires the expected decision without inventing additional palette or
theme changes.

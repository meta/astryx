---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: every contrast problem is listed in the JSON (`newProblems`, `openProblems`, `problems`); the text shows the first eight and counts the rest. A change's new problems are the ones the settings before it, read as the change reads them, did not have, so a base or part saved in other letters no longer loses the check or lists old problems as new. A fix line sets what draws the text: a plain `color` that wins over a token, else the text token, scoped to the variant the text is drawn in, so following it clears the problem; text written straight in a part with its own `color` is measured against the part's fill. `show` says a saved base in other letters reads as the base; an entry with a thing and no value gets its `undo` line; a dial name in other letters (`Corners`, `MODE`) is the dial; a theme typo on a step back with nothing to undo offers `show`; and `new`'s set repair for a theme it did not make follows its `new` line as the next step.

@josephfarina

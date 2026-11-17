---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: what is pasted is read as meant, and a repair carries the value given.

- A repair never offers a stock value the input did not hold (a gray, a violet, `inter`, `system`, `1px`): a line that sets the same setting again carries the value typed or saved, cleaned, else `how` for the setting.
- A value labeled with a word that is not the setting's own name is refused with what the word means, never set with it dropped: a mode (`accent 'dark: #2563eb'` offers `--color-accent '#2563eb' --mode dark`), a state (set on a part with `--state`), a kind of screen (not set per screen), a part (`--on <part>`), a heading level (`headings 'h1: bold'` offers `font-weight 700 --on heading --when level:1`), or a word it does not read. The setting's own name before the value is the value (`font 'fontFamily: Inter, serif'`); a camelCase or quoted label of another setting names it.
- A size multiplied by a variable with a number fallback (`calc(0.75rem * var(--x, 1))`) is taken.
- CSS function names in any case are read (`LIGHT-DARK(…)`); a `light-dark()` with another separator offers the comma; a font list missing the comma before its generic family (`Georgia serif`) or with a spaced generic (`sans serif`) offers the list meant.
- A backslash before `#`, a quote or a space is taken off; a JavaScript escape in a `content` string is written as CSS writes it (`\u2022` is `\2022`); JSON arrays and design-token objects (`{"$value": …}`, `{"value": 18, "unit": "px"}`) are read as their value.
- `headings lighter` is the weight light; two headings words give one line each.
- The change receipt names a quote or space mark as its CSS escape, so text and JSON name the same value; a saved value in corner brackets is named as quoted, not as spaces.

@josephfarina

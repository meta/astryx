---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the input reader covers more pasted shapes, and a repair still offers only the value typed (cleaned) or a documented reading of it, never a stock value.

- A label on a part's property or a type token is read like a label on a dial: `padding 'hover: 4px' --on button` offers `--state hover`, `'dark: red'` offers `--mode dark`, `'card: 4px'` offers `--on card`, and the property's own label (`background-color: red`) is the value. A label naming another setting (`'accent: red'`) offers that setting on tokens and part properties too, and never sets the font to it.
- A label that is a flag's own name (`state: hover`, `part: card`, `variant: primary`, `mode: dark`) says what that flag does instead of naming unrelated parts. One labeled entry in JSON (`{"color": "#e11d48"}`) is read like its CSS form, and a value pasted with a token's label (`'--color-accent: #e11d48'`) is no longer taken for an unknown option.
- An object of several settings written with single quotes or without braces gets one line per setting.
- A saved `red / blue` color offers its `light-dark()` pair; a saved vibrancy with no color to saturate offers only its undo.
- A whole font stack in one pair of quotes (`"Inter, serif"`), families split by `|`, `;` or `/`, and a comma missing before any generic family (`Inter, Georgia serif`, `georgia serif`) are offered as the list meant. `font: Inter, serif` and `fontFamily:` labels are read. `\u0020` in a family and `\x2022` in content are read as CSS reads its escapes.
- `density roomy` offers `spacing roomy`, and words for more or less room map that way. Corners and spacing words with nothing near, and size tokens with nothing readable, offer `how` instead of a stock rung or the token's default.
- A calc() whose units cannot combine (`8 + 2px`, `0.5rem * 1px`, with each var() at its fallback) is refused.
- `--mode night` or `day` on a color dial offers the one-mode line, never the both-modes one.
- A hex color a digit short is refused as it is, without making a digit up; `navy blue` offers `navy`, and `0xe11d48` offers `#e11d48`.

@josephfarina

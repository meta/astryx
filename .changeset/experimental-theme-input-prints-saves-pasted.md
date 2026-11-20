---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` reads input it prints or saves, pasted or read back, as it reads typed input:

- A setting pasted back as the editor prints it (`padding = 8 px on card`) or as a declaration (`z-index: 1,000`) gets the repair its typed form gets (`set t padding 8px --on card`), and the editor's own change line (`corners pill -> round`, `--radius-element: 0.5rem -> 0px`) sets the value it changed to.
- A pasted entry without its braces (`"thing": "corners", "value": "pill"`), one that names its setting under `setting`, and one whose `only` says no (`"no"`, `"false"`, `"0"`) are read as that entry; an `only` that reads as neither yes nor no is refused.
- A saved token or property entry whose mode is `both`, empty or a typo gets set's reading of that mode beside the undo, and a token saved as `var(--color-accent)` is that token.
- A setting name of more than one word is quoted in the lines offered, so a scope typo beside it keeps its repair; a setting and value in the other order beside a scope typo get both repairs.
- `new --accent 'light blue'` offers `lightblue`, never a line without the color; `new --font -apple-system` reads the dash-led word as the font.

@josephfarina

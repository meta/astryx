---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a mode phrase scopes the ask, and typed tokens are read only when they are real.

- "In dark mode only, cards #111111" sets the cards in dark mode; the theme becomes dark-only only when the ask is about the theme's modes. A clause that only names a mode scopes every clause after it. "Daytime" is light mode; "at night", "night mode" and "OLED" are dark mode (a bare "day" or "night" is not a mode); "dark: …, light: …" sets each mode, and two values for different modes are not a contradiction.
- A token typed at the start of a question is set exactly; a flag-like word that is no token (`--like`, `--value`) is read as words, and a real token in a later clause ("and set --border-width 2px") joins the other changes. A quoted font stack keeps its quotes.
- "No more than 2px borders" and "at most 2px" are 2px, not none.
- "Error text" and "labels" with no part name give a lookup, never the whole theme's text.

@josephfarina

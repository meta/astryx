---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: every CSS math function is read by its type, and fonts are judged against the theme build's own list.

- `pow()`, `sqrt()`, `hypot()`, `log()`, `exp()`, the trigonometric functions, `mod()`, `rem()`, `abs()`, `sign()` and `round()` are accepted where the type they give fits; `sqrt(4px)` and `mod(10px, 3s)` are refused.
- Which system fonts need no install comes from the list `astryx theme build` warns by, unchanged; the editor only knows which of them ship on one system.
- `font more` names the commands that work.
- Math inside a color is checked too (`rgb(calc(1px) 0 0)` is refused), and `color-mix()` needs a share of at least one color. `calc(1fr)` is refused, since math takes no `fr`.
- A token only widths and offsets read (`--border-width`, `--focus-outline-width`) refuses a percentage, which those properties drop.
- A font that ships on one system says which one (`"Segoe UI" ships only on Windows`), instead of calling it no system font.
- The check for a hand-edited settings module reads files with Windows line endings.

@josephfarina

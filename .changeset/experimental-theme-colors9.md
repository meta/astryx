---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: math, keywords and fonts checked the way the browser reads them.

- Math in `calc()` and the other math functions must add like types and give the type the value needs. `calc(4px + 2)`, `calc(10px / 2px)` and `padding calc(1s)` are refused.
- A token never takes a CSS-wide keyword (`--font-family-body inherit`): it would leave the token empty.
- A font that ships on one system only (Segoe UI, Consolas, Menlo, Helvetica Neue, Roboto) is named as such.
- `font` refuses `var()` and names the role's token that takes it. `font geist-sans` is the `geist` preset, and `text-size Medium` suggests `medium`.
- A hand edit to the generated settings module is built over from the settings, as the module says, instead of being kept by the next change.
- `how font` no longer says a body font moves the headings.

@josephfarina

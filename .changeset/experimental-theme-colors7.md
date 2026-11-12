---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: what `set` accepts always loads, and a theme keeps the colors it shows.

- A setting that the theme could not load is refused when you set it, such as a font with `!important` or a comment.
- A border or outline width below 0, a duration below 0, and an unquoted url with brackets are refused on a part.
- Switching a theme to light-only or dark-only lists the colors that visitors in the other mode lose.
- A change that leaves the colors, the mode and the base as they were keeps the shades the theme already shows, so a theme an earlier editor built keeps its colors, and undo brings them back. The next color change maps every color with the current rules.

@josephfarina

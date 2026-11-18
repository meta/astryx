---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental theme editor how`: a top bar's fill reaches the top nav along with its text, so the text always reads on the bar's own fill; a top nav takes a fill of its own. A word that begins only one component's name before a part noun names that component ("segmented buttons" are the segmented control, never every button). After a ";" that goes on with a part's colon list, the items its bar holds are that bar's ("navigation bar: …; the selected item gets a pill" styles the top nav's selected item), and a top nav's items in the bar are written on the top nav item.

- `astryx experimental theme editor`: the danger color now reaches the error toast's fill and the gray dial the slider track (each at the shade nearest Core's own), a pale accent that does not read on a track gets a line on its own fill rather than one darkening the track, and a selected look's missed line says what the accent tint draws in dark, with a softer one first where it is a strong block of the accent.

- `astryx experimental theme editor show --png` notes text its pictures draw too faint to read that no contrast check measures (a menu drawn open, a pressed or selected state, a variant), with the part, the ratio and colors and the picture it is in; the theme's disabled and placeholder text and text over media are left out. A ratio just under what a check needs is said cut down, never rounded up to read as meeting it. Text a base theme colors through the part around it (a colored card) gets the line that sets that token there, and clears once it is set.

- `astryx experimental theme editor`: text failing on three or more of its ground's variants is grouped into one problem even where no line fixes it, and a part filled exactly as the page (the app frame painted the page color) is no longer noted as barely showing.

- `astryx experimental theme editor show`: a missed line that sets a status color (after a vibrancy change) gives a color that color's own contrast check passes, so following it no longer brings a new problem (a warning too faint on the page).

- `astryx experimental theme editor set` says a problem the theme had that the change moved but left failing (a darker accent still too faint on the progress track), apart from the new ones, with what it was and its fix (`leftProblems` in the JSON).

- `astryx experimental theme editor how`: navigation and heading asks reach what they name. "Side navigation" and "top navigation" are those parts; a selection said of a part is its selected items ("white sidebar, blue selection"); a role word right before a written color names that color ("our brand color #1E3A8A"); a color and its part said right after another color and part is an item of its own; a top bar's text color reaches the top nav too (its items wherever it sits); and a heading's text color reaches every part Core draws as a heading element (an empty state's title, a markdown heading).

- `astryx experimental theme editor` says the same text failing in the same color on three or more of its ground's variants (an accent link in every colored card) as one problem for each mode, with each variant's line in one, instead of one problem per variant.

- `astryx experimental theme editor`: the category colors a look grows now carry more of the look's character.

- Each hue turns a small share toward the accent's hue (at most 10°) and toward a tinted neutral's (at most 6°). A slate theme runs cool and a warm gray warm.
- Card tints sit a step deeper for a dark or strong accent and a step paler for a pale one.

Two looks of the same strength, such as a navy accent on pure gray and a mid blue on slate, no longer draw the same badges and card tints. Hues stay distinct, and the readability guards still apply.

- `astryx experimental theme editor`: the category and status colors a look grows now follow only the look's own inputs (accent, neutral, vibrancy). A page fill or a link color set exactly no longer moves them, and a category fill stays a tint instead of following a text color to white or black.

Where a base theme draws its own text with one of these colors and the grown value would not read, the base theme's value stays in that mode, with a note. This covers butter's coloured cards with their dark text in dark mode, and gothic's Delete button.

A set `--color-on-accent` (or another role's text or icon color) reaches only what reads it, and a role color set for one mode leaves the base theme's own parts as they are in the other mode.

- `astryx experimental theme editor`: a whole-theme `--color-accent` set as a token now acts as the theme's accent when no accent color is set. Links, selected rows, list items, citations and the accent tint grow from it, as they do from `set <theme> accent`. A dark value set with `--mode dark` carries the dark shades, and the token keeps the exact value it was given in each mode. Set for one mode only, it moves that mode only: the other keeps the base theme's colors.

- `astryx theme use` and a later `astryx theme add` say when no source file of the app imports the generated theme module, so the default theme they record is not what the app shows yet, and print the one-time wiring (`change.notImported` in `--json`). `astryx doctor` and these commands read that from one shared check.

@josephfarina

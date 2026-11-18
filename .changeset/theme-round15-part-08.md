---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a long request that mentions color-blind readers alongside other changes now answers every change. Only a question about color-blind readers alone gets the color-blind answer by itself.

- `astryx experimental theme editor how`: a feel word said for the whole theme now moves the dials whose help gives that feel, and each line says what it read. For example, "playful minimal recipe site" gives playful → corners round and vibrancy more, and minimal → spacing roomy and surfaces flat. The corners, spacing, surfaces, vibrancy and type help now says which feel each rung gives (see `how corners`). Words no help names are listed as not taken. A dial the ask sets itself keeps its value, and a feel word said of one part stays with that part.

- `astryx experimental theme editor how`:

- "heavy condensed headings" now gives heavy headings. It used to give light ones.
- "heavy" uses the headings dial's heavy setting.
- "condensed" before headings or a font now says that a condensed look comes from the font family, instead of reducing the headings' spacing.
- An opening phrase before a colon ("page loud and fast: …") is no longer reported as a missing part.

- `astryx experimental theme editor how`: a describing word said with "theme" ("minimal theme", "playful theme") is no longer answered as a brand whose colors are asked for. A picture named only by its file ("here is our brand board: ./look.png") now gets the answer for a picture, which says what to describe.

A built-in theme named as the look ("start from the butter look", "base butter") is now answered with the base (every setting is kept), instead of matching nothing. A base that is not installed is named with the line that installs it.

- `astryx experimental theme editor how`: after a larger base text size, "larger headings" makes every heading larger. It used to work from the base theme's original sizes and made every heading smaller.

- `astryx experimental theme editor how`: a text color for one kind of a part, such as white text on destructive buttons, is now checked against the fill the base theme actually draws for it. The answer applies the color only in the mode where it reads: for example, dark mode only when the light-mode destructive fill is pale. Before, it was checked against a different color than the one drawn, so how could suggest text that the check after setting it flagged as unreadable.

- `astryx experimental theme editor set … border-radius '0 0 6px 6px' --on dropdown-menu`: a radius of two to four corners is taken on a part whose corners Core reads inside calc() (a menu's popup and its rows); each corner goes on the box, and the first corner is the one length the inner rows follow. `how` reads "menu corners 0 0 6px 6px" as that radius, each corner as written.

- `astryx experimental theme editor`: status colors are checked for color-blind readers.

When the theme changes a status fill (info, success, warning, danger) and two of them may look alike to someone red-weak or green-weak, `set` and `show` say so. The note includes a line that moves one of the pair lighter or darker. `how` answers color-blind questions with what the editor checks and how to keep statuses apart.

- `astryx experimental theme editor`: text on a selected row or a selected preset keeps reading.

- A text color set on a selected part that holds other parts (a table row) also sets the primary and secondary text tokens there, so a checkbox label in the row follows it.
- Accent text set exactly that sits on the accent tint (a selected date-range preset) keeps reading: the tint takes the nearest stop, still a tint, under which it reads.

- `astryx experimental theme editor`: a tinted gray now carries its tint into primary text and icons. They take the darkest shade inside its ramp in light and the lightest in dark, so a slate or warm theme no longer draws pure black or pure white text. A pure gray keeps black and white.

@josephfarina

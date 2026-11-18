---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a color said to the whole theme now sets the accent. This covers "make it blue", "it should be blue" and a color in a branded look such as "a purple branded portal". A color said right before the accent word with a part ("blue accent buttons") now sets the accent to that color, instead of being dropped.

- `astryx experimental theme editor how` on a long ask reads a palette color said as a look ("a cool slate palette") as the neutral color even when other clauses name parts, reads "light and dark" said on its own as the theme's two modes, and names a word no setting reads ("fast") in any list of three asks or more.

- `astryx experimental theme editor how`: long asks keep each change where it was said. "tables with 13px text, uppercase 11px headers" changes the table header cells, never the whole theme's text size or every cell; "other tabs #6c7688" after an underline clause is their text, never a fill; in "sidebar #f7f7f5 in light mode and #202020 in dark mode, text #37352f in light mode" the dark color is the sidebar's fill and the text the theme's; "code #eb5757 text on #f7f6f3" is the code's fill, never the page; and a fill for every button keeps the destructive button's red, with a readable text line for each look whose text would not read on it, in either mode.

- `astryx experimental theme editor how`:

- A one-line look no longer drops pieces without a word:
  - A color "for" something that a status color's own description names, such as "mint green for positive numbers", sets that status color. Anything else, such as "coral for overspending", is listed as not taken.
  - "tabular numbers" sets tabular figures throughout the app.
  - "works in light and dark" is read as both modes.
  - A word about a color ("a cheerful sky blue") describes that color.
  - "sunny yellow highlights" is listed as not taken instead of painting the buttons named earlier.
- Every list of three or more pieces names the words it did not use, even when some pieces name parts.
- "near-black text" uses a near black (#111111). "navy tinted grays" sets the neutral color.

- `astryx experimental theme editor how`: a look named for the whole theme and said on its own ("cozy warm vibe", "whatsapp theme") is now answered instead of matching nothing. Words a setting reads are written, and the others are named. A look named after a brand or product asks for its colors as hex, and how never guesses them. "warm" and "cool" are no longer listed as unread when the neutral grays took them.

- `astryx experimental theme editor how`: a picture given as the look to match ("make our app look like this picture: ./look.png") is now answered with what to describe in words (colors, font, corners, spacing), with a line to start from. It is no longer read as the app's own photos. A product said to be dark ("a dark analytics dashboard") is now a dark theme, as "a dark theme" is.

- `astryx experimental theme editor show --png` names each sheet whose pictures draw text over the text beside it, the family pictures included, and counts letters that reach a fraction of a pixel into their neighbor's text. Its sheets also widen a cell whose row scrolls sideways, so a carousel's picture shows every slide and cuts none at its edge.

- `astryx experimental theme editor`: a `--color-border` in a color of its own now reaches the input frames even when it is fainter than them.

The emphasized border, which frames inputs, selectors, selectable cards and collapsible triggers, takes the border's hue at the frame's own strength, so controls stay in the border's family and keep their contrast. A stronger border still carries the frame as it is, a fainter gray leaves it, and an exact `--color-border-emphasized` keeps its own color.

- `astryx experimental theme editor`: a look now themes its code and its overlay scrim too.

- Each syntax role grows from its hue's color: keyword and type purple, string green, number and constant orange, function blue, tag red, attribute yellow, property teal. Comments, operators, punctuation and variables grow from the neutral. Each takes the nearest shade that reads at 4.5:1 on the code background and on the page. The code-block title follows the comment color.
- With a neutral color set, the code background and the overlay scrim come from the neutral.

A role no shade can draw readable keeps the base theme's, with a note. Results count these in one line, "code colors and the overlay: N values moved with the look". A `--color-syntax-*` or `--color-overlay` set by hand wins.

- `astryx experimental theme editor show`: when a theme's own source changes without changing its outputs (an added `import './brand.css'`), show says what the build says: the stylesheet the outputs do not carry, to import in the app beside the theme's stylesheet.

@josephfarina

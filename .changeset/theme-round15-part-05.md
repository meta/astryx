---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` notes a fill you set on a part that sits on the page when it barely differs from the page's color and the part has no border or shadow (a beige banner on a cream page), with the line that gives it an edge.

- `astryx experimental theme editor set` says when a fill on a part leaves one of its own sub-parts on the fill it had (a code block's header), so the part shows two tones, with the line that gives the sub-part the same fill.

- `astryx experimental theme editor how` now answers every clause of an ask: each one ends as a command or a named "not used" line, never silence. Long asks also keep each clause's own reading:

- What a look turns into in a state ("1px bottom border that turns accent and 2px when focused") is that look in that state. The border before it stays at rest.
- A typed text color beside "never use pure black for text" already keeps the rule, so nothing else is written.
- Hues said of a part's statuses ("status badges: green, amber, red") go to its success, warning and error variants.
- A typed color beside a theme color's word ("accent buttons #0F6CBD") is the color asked.
- A part's underline, where the part draws one of its own ("selected tab … with a 2px underline"), is that indicator.
- A size beside a text color ("12px white text") is that text's size.
- A page's title is its top heading.
- "light mode only" at the end of a long ask keeps the theme to light mode and writes no dark-mode steps.
- After a list of several parts, a look with no subject ("…, and subtle borders"), or a role ("and a teal accent"), is the theme's.
- A tone said of body text ("lighter body text") is its color, not its size.
- "all of it" keeps a heading ask: where its first line changes nothing here, the next line that passes takes its place.
- A look word after a part ("destructive buttons solid red", "table rows highlight … on hover") is no longer read as a part name.
- "softer, larger card shadows" is a bigger shadow, stepped from the one the card paints.
- Items after a comma leave a with-list ("dark sidebar with white text, rounder cards, and bigger headings").

- `astryx experimental theme editor how`:

- Every page-color answer now also paints the app shell's frame and the main panel, in the same mode. The whole page shows the color instead of only the area behind the panels.
- A text color written for dark mode only on a part that also sits on a dark surface in a light page, such as a toast, says that the color shows there in light mode too.

- `astryx experimental theme editor set` says the missed line only when the change left a new miss (`missedNew` in the JSON counts them), instead of repeating every standing miss after each unrelated change; `show` still lists each.

- The pictures of `astryx experimental theme editor show --png` draw a dialog that has no background of its own (a lightbox) in its backdrop's colour, so its light close button shows as it does over the page, and they report text drawn over the text beside it (calendar weekday names wider than their columns), on the sheets too, as a note and an open problem.

- `astryx experimental theme editor` says a contrast problem once when two measurements of the same text on the same fill give it alike, rather than listing it twice with the same line.

- `astryx experimental theme editor set` names the size a dial step drew on a part (`corners = large on card (drawn as border-radius 14px)`), and a gray that keeps the page color you set no longer offers a line setting that same color again.

- `astryx experimental theme editor set … corners square`: square corners square every pill that is a styling choice (badges, progress tracks, a switch's track) and keep the parts drawn as circles round (avatars, a switch's or slider's thumb, step dots), told apart by each part's own box; the result names the circles kept, with the line that squares one, instead of a line that squares every circle too.

- `astryx experimental theme editor`: a text color set on a highlighted row (a command palette, typeahead or selector item) over its see-through tint gets the line that makes the highlight a solid fill that text reads on, not a line that turns the text dark; and a fill set on a toast names the `--when type:…` line for each type it covers.

- `astryx experimental theme editor`: the status roles a theme leaves unset (info, success, warning, danger) now follow its look. Each grows from the base theme's color for the role, at the accent's strength and the palette's vibrancy. It turns up to 40° away from the accent's hue when the two would sit together (info stays a blue, danger a red), and is kept apart from the accent. Text on each fill, on its tint and on the page reads at 4.5:1; warning stays a bright fill with near-black text. A role that cannot be drawn readable and apart keeps the base theme's colors and says why. A role the theme sets, or a token set exactly, wins. Badges, banners, status dots and field status follow.

@josephfarina

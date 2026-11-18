---
'@astryxdesign/cli': patch
---

[experimental] A color with an opacity after its slash, as Tailwind writes it (`ring-black/5`, `#000/12`, `white/[.08]`), is read as that color at that opacity. A Tailwind palette stop with an opacity (`bg-blue-500/20`) is read as that stop's hue at that opacity: `how` writes the editor's own color for it, and `set` names the stop. `astryx experimental theme editor how` writes it as `rgb(r g b / alpha)` (a card's `ring-1 ring-black/5` is a 1px ring at 5% black, no longer a solid black ring), and `set` refuses the shorthand, which is no CSS, offering the same color written out at that opacity. The opacity is never dropped.

- `astryx experimental theme editor how` now binds each clause of a long ask to its own part:

- A part word in a clause wins over a part carried from before.
- A part said in one clause reaches a clause that names none of its own only when that clause comes right after it. A part a list is led by reaches all of the list's items, until another part is said. A part carried once is carried no further.
- A look out of that reach, with no theme word and no dial of its own, is named in its own words, never written on a part said further back or on the whole theme.
- A mode pair stays on one part: "borders #d5dbe1 in light mode and #30313d in dark mode" in an inputs list writes both halves on the inputs.
- A bare color said of a part that paints no fill of its own (a tab, a side nav item at rest), in an ask that speaks of that part's text elsewhere, is its text color: "tabs 14px text, …, other tabs #666666".
- "#f7f8f8 text on #1c1d1f" after a part keeps the text on that part, in its state.
- Items said with a subject that names no part ("kbd hints … with … text and 4px corners") are held with it and written nowhere.
- A color said of a part that fills when checked (a switch, a checkbox, a radio) is its checked fill, in a list of parts too, so off switches and unchecked boxes keep their look: "switches, checkboxes, progress bars and tab underlines in magenta".
- A list's rows are its head part's own items: "menus with 4px padding and 32px rows".

- Fixes in `astryx experimental theme editor how` for part names in long asks:

- A part word right before another part word names a kind of that part: "label badges: …" writes on badges alone, never on form field labels too. A part that holds the other still reads as the place ("dialog buttons").
- "underline nav" is a row of tabs, and "navigation rail" is the side nav, in the one part-words table.
- "the top nav: …" writes on the top nav alone, never on the app frame that holds it in its slot. "the top bar" still reaches both bars.
- A color said with a state and no look word ("…, and a #f8f9fa hover") is the part's fill in that state, never the line color a clause before it named.
- A product label that ends in a product word ("live sports scores page: …") is the product, never the page part. "team colors red and blue as accents" makes the first color the accent and names the second, since a theme has one accent.
- "serif headings with a sans-serif body" sets the body's font, with no false contradiction on the headings.

- In `astryx experimental theme editor how`, "their" and "its" point back to the part said last ("make dialogs wider, their titles bigger" sizes the dialogs' titles, not every heading). A color said of one side with no fill word ("hovered tabs with a #0969da bottom", "… and rgba(0,0,0,0.25) on the bottom") is that side's line, never the part's fill.

- In `astryx experimental theme editor how`, a fill given as a theme color ("selected tab accent", `var(--color-accent)`) now gets the same readable-text step as a typed color, measured as that color is in each mode. Its text takes the theme color's own text color (`var(--color-on-accent)`) where that reads, so it follows when the theme changes the color. The answer that runs a whole ask in order carries that step right after the fill.

- Every line a refusal of `astryx experimental theme editor set` offers keeps the scope typed: a `--state` or `--when` on the same part, and a `--mode`, go into the line whenever set takes it with them. A hovered link's color (`color '#00438a' --on link --state hover`) is now offered as `--color-text-accent '#00438a' --on link --state hover`, so following it changes the hovered link only, not every link at rest. A line set would refuse with a flag (a `--mode` on what is not a color) is still offered as the one that works.

@josephfarina

---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the input reader reads numbers, labels and font lists one way on every path.

- A comma between digits is a decimal point (`1,125rem` is 1.125rem, `1,250s` is 1.25s); only on a weight, whose numbers are whole hundreds, is a comma before three digits a thousands mark (`1,000`).
- Two numbers are never joined into one (`12 16px` is no 1216px); only a unit split off by a space (`16 px`) is read with its number.
- A minus sign is never read away: `-8px` for a size, a padding or a duration gets `how`, never `8px`, and `-700` on a weight is no weight 1.
- Another CSS property's declaration is no setting's value on any setting (`corners 'margin: 24px'`, `text-size 'width: 20px'`); a pasted property is read only when the setting is what it sets (`border-radius` for corners, a color property for a color dial, a property that reads the token).
- One reader for a family list on the font dial, a family token and a part's `font-family`: a weight or a size in the list, alone or after a family (`Inter, 600`, `Inter 600, sans-serif`, `Inter extra-bold`), is refused with the families and the headings weight (a weight word that is part of a family's name, as in `Arial Black, sans-serif`, stays part of it), and a quoted generic (`'sans-serif'`) is offered unquoted; a part's `font-family` reads a missing comma before a generic as the dial does.
- Values a property's grammar pairs with a slash (`aspect-ratio 16 9`, `grid-row 2 4`) are offered as the pair (`16 / 9`), never the first number.
- A mode label in any spelling (`dark mode: red`, `darkmode: red`, `mode dark: red`) is that mode's label: the offer is `--mode dark`.
- A base or mode in the settings file one slip off (`neutrl`, `light`, `lightonly`) is read as meant, as `set` reads it; one that reads as nothing is refused with the line that sets it, never dropped by an unrelated change.
- A pasted object whose entries all fail points to `how` for each entry, never `how settings`.

@josephfarina

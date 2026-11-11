---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: lists, several colors and per-mode colors.

- Each line of a question, and each item of a bulleted or numbered list, is its own ask. A "no" on one line never reaches the next.
- Several colors in one question are each kept: "accent #0ea5e9; danger #ef4444; success #22c55e" sets all three. A hex binds to its word whether it comes before or after it ("#0d6efd primary"), "bg=#fff text=#000" splits per color, and "primary" is the accent. "Secondary" has no setting of its own, so it is offered as the secondary button fill.
- A color that `how` works out (darker, lighter, more contrast, stronger borders, a darker overlay) is set per mode, each from that mode's own value, so dark mode keeps light text. "More contrast" acts in light and dark mode and says so. "Fails contrast on white" never picks white. Text already at full contrast says so instead of changing nothing.
- CSS property names read as their properties: `letter-spacing`, `line-height`, `font-size`, `font-weight`.
- Better meaning: "drop shadow: x 0, y 4, blur 6, spread -1, <color>" sets that shadow; "ditch" removes; "revert the rounded corners" takes back the corner settings the theme has; "swap A for B" asks for B; a radius of 0 is square; "12 pixels" is exactly 12px; "taller (44px)" sets that height; "too warm" makes the grays cooler; a part with no recorded fill gets darker or lighter through a brightness filter.
- Typed values are kept: gradients written "from A to B", shadows with several layers, quoted font names and font names before the word "font". Quoted text that is not a font name is read as words.
- Parts: a table's header, the error banner (`--when status:error`), "button color" as the text color. Markup and comment text in a question are ignored.
- Italian, Spanish, Korean, Russian, Arabic and Hindi words for buttons, cards, rounded, shadow, remove and accent are read; "y", "et", "und" and "и" join two asks.
- A step given twice in one answer runs once. `undo` is suggested only when there is a change to undo.
- When `font --on body` also changes the heading font (the theme sets no heading font), `how font` says so, and a body font question uses `--font-family-body`.
- An answer with no command says why. Commands in an error's suggestions start the same way in JSON as in text.
- A `--at` point outside the picture reads as no color.

@josephfarina

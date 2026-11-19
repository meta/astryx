---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads more asks the way they are meant:

- A bound limits the asks of its own kind said with it. "never rounder than 8px; make the buttons and cards rounder" holds the buttons and cards and leaves the rest of the theme alone. "the cards bolder, but never rounder than 8px" still makes the cards bold. A size bound holds each heading size it would pass, and a part already past a bound is left as it is.
- A color bound said by its color alone ("darker in dark mode, at most #000000") keeps the ask's mode. A held color keeps its own hue. A color setting past the bound in one mode is written only for the other mode.
- A contrast ratio "on muted cards" or "on the muted background" is measured against that background.
- Amounts are read as typed: "20% fainter" (80% of the border's strength), "the card background more transparent" (its fill, not the whole card), and "the text 80% opaque".
- Questions answered from what the theme reads: a status banner's background, the focus ring's width or color, and how thick dividers are.
- Typed tokens with a direction ("--color-accent and --color-error darker") move each token from its own value.
- "the page rounder" and "the page font Georgia" change the whole theme, not the page background.
- "the emphasized border", "the muted text" and similar names change that border or text token.
- "dividers thicker and red" does both.
- "radio circles red" colors the radio's circle.
- "transitions faster" and "animations 1,500 ms" change motion.

@josephfarina

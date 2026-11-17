---
'@astryxdesign/cli': patch
---

[experimental] Fixes in `astryx experimental theme editor how` for part names in long asks:

- A part word right before another part word names a kind of that part: "label badges: …" writes on badges alone, never on form field labels too. A part that holds the other still reads as the place ("dialog buttons").
- "underline nav" is a row of tabs, and "navigation rail" is the side nav, in the one part-words table.
- "the top nav: …" writes on the top nav alone, never on the app frame that holds it in its slot. "the top bar" still reaches both bars.
- A color said with a state and no look word ("…, and a #f8f9fa hover") is the part's fill in that state, never the line color a clause before it named.
- A product label that ends in a product word ("live sports scores page: …") is the product, never the page part. "team colors red and blue as accents" makes the first color the accent and names the second, since a theme has one accent.
- "serif headings with a sans-serif body" sets the body's font, with no false contradiction on the headings.

@josephfarina

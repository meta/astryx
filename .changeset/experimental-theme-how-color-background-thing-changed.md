---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`:

- What a color is read on is the background, not the thing changed: "the warning color darker so it reads on the page" darkens the warning color until it stands out 3:1 against the page.
- A page color's second line also paints the main panel drawn over the page. Asking for the page color alone leaves the main panel as it was.
- "table header text uppercase 12px" keeps the 12px as the text size.
- "when inputs are focused, a 2px ring" is the inputs' focus ring.
- "only a bottom border" removes the other sides. "A slightly darker bottom edge" darkens that side's color only.
- "all text at least 7:1" checks the main, secondary and accent text.
- "large text" and "small text" make the text larger or smaller. "grayscale" and "no color" set vibrancy to 0.
- In a look typed as one line, "deep green" is a deep green, and a quiet color like sand becomes the neutral. "A theme that works in dark mode" no longer limits the colors to dark mode. "The app should open in dark mode" points to `<Theme mode="dark">`.
- A purpose ("so readers see which page they are on") is never read as a part. "Make text more readable" makes the text larger. "Headings a bit lighter" moves one weight step. A color named before a part ("the brown content area") describes how it looks now.

@josephfarina

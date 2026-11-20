---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a negated word as what it says:

- **Negated words:** "un-rounded", "non-rounded" and "unrounded" buttons are square, and "un-bold" headings are regular. "border-less" and "shadow-less" are removals, with or without the hyphen.

Other readings:

- **Comparisons:** "as round as the accent" names nothing with a shape, so it is refused with that reason.
- **Removals:** a list of any length gives each item its own "from", so every item is removed.
- **Kept sizes:** "bigger except the small ones" keeps the small size only. When a keep would take the whole change back, the answer says so instead of reporting it as done.
- **Mode pairs:** the main text gets both halves of "darker in dark mode and lighter in light mode", as do typed colors per mode.
- **Heading levels:** "every heading except h1 smaller" leaves h1's own size token out.
- **Titles:** "dialog heading text" colors the dialog's own title.
- **Neither/nor:** "neither rounded nor bordered" negates both words.
- **Fully rounded:** "fully rounded" is the roundest rung.
- **Keeps said first:** "keeping cards, …" and "keep the accent, …" said first are keeps.
- **Except answers:** an except answer names the whole ask it belongs to.
- **Mode splits:** the second half of a mode split keeps the part phrase and its state ("selected tabs red in light mode and blue in dark mode").
- **Color words:** "dark gray in light mode" is a color, not a mode.
- **Excepts in one mode:** an except holds in a one-mode answer too.
- **Ghost buttons:** a hovered or pressed ghost button steps its own wash, never the primary's fill.
- **Check marks:** "check mark" is the mark drawn inside the box, colored with its text color.

@josephfarina

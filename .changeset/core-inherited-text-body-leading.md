---
'@astryxdesign/core': patch
---

[feat] Text inside a `Theme` that sets no line height of its own now uses the theme's body leading (`--text-body-leading`), as Core's own body text does, instead of the reset's 1.5. Plain text in a Card or Stack and a Blockquote's quote follow the theme's line height and move when a theme changes it. These Core parts now also set the leading of the text role whose size they set: Table cells and header cells, Calendar month heading, day, weekday and week-number text, Stepper step text, Pagination, Collapsible titles, Command Palette items, the chat system message, Tokenizer and Slider labels. With the default theme, 14px text moves from 21px to 20px lines; 12px text in the chat system message, Calendar weekday and week numbers, small Pagination labels and the Tokenizer overflow count moves from 18px to 20px lines (the supporting leading); 12px text that only inherits moves from 18px to about 17px; Collapsible titles move from 25.5px to 24px. Text outside a Theme is unchanged.

To keep the old lines: for inherited text, set a line-height on your own container inside the Theme, or set `--text-body-leading` in your theme (which also sets Core's own body text). The listed parts follow their role's leading token instead (`--text-body-leading`, `--text-label-leading`, `--text-supporting-leading` or `--text-large-leading`): set that token in your theme, or style the part through its theming target.

@josephfarina

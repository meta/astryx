---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set` now writes a text look where the part's text reads it, instead of refusing or writing what never shows:

- A color on a part that draws no text of its own (the app shell header, the top nav) also goes into `--color-text-primary` and `--color-text-secondary` on that part, so the labels inside it take the color. The contrast check measures them that way.
- A color on a link or a text goes into the token its color prop reads (`--color-text-accent` on links), on that part alone, as a heading's color already did.
- A text size, weight, line height or letter spacing on a part whose text is drawn by elements that read one token for it (`font-size` on a banner or a code block, `font-weight` on the top nav heading) goes into that token on the part. Where the text reads several tokens (a title and a subtitle), set still refuses and names each.
- A bare `0` on a padding read inside `calc()` is saved as `0px`.
- A token the part does not read, where the parts inside it do (`--text-body-size` on a tab list), is refused with those parts' token on the part. A part name with a piece after it (`top-nav-heading-title`) is refused with the part that holds it.

@josephfarina

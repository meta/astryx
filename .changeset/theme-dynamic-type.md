---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] In Safari on iPhone, text follows the reader's text size (Dynamic Type) in every theme, branded included. Where the browser exposes that size through `font: -apple-system-body`, as Safari on iPhone does, the theme's font sizes scale with the size the reader picked in Settings (Display & Text Size, then Larger Text), each size on the curve of the iOS text style it plays: body text like Body, `heading-1` like Title 1, display text like Large Title, with every role kept in order. A semantic size a theme fixes at a length, such as the 0.75rem supporting text of Butter, Stone and Y2K, scales on the curve of the step it reads by default. At the default size every font size is the theme's own; the family, spacing, line-height ratios and the root font size never change, text inputs keep their 16px floor on iOS, and browsers without the keyword see no change. There is no option, prop or document attribute: the root `Theme` reads the reader's size from a hidden element. `astryx docs typography/type-scale` describes it.

@vjeux

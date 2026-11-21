---
'@astryxdesign/core': patch
---

[fix] Filled buttons keep their label readable on hover and on press. Where the page's hover or pressed overlay dropped a primary, secondary or destructive Button's label under 4.5:1 on its fill, such as Core's own dark-mode primary, the Button now paints that state with a tint chosen for its fill and label that keeps the label at 4.5:1 or more, and shows wherever a tint can do both. Every other filled Button keeps the page's overlay, and a theme's own button rule for `--color-overlay-hover` or `--color-overlay-pressed` still wins.

@josephfarina

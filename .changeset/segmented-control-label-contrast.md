---
'@astryxdesign/core': patch
---

[fix] Restore 4.5:1 label contrast for unselected SegmentedControl segments. The unselected label used `--color-text-secondary`, but the control's surface is a translucent `--color-neutral` overlay whose effective color tracks the consumer's page background — on mid-tone backdrops the label measured 3.66:1 in dark mode, below the 4.5:1 the component's own documentation requires. Unselected labels now use `--color-text-primary` (>=7:1 wherever the page's own text passes); selection remains carried by the surface fill, shadow, and weight, and themes can still dim the label through the theming target. (#6469)

@ManoharPaturi

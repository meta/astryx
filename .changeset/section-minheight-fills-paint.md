---
'@astryxdesign/core': patch
---

[fix] Section: with `minHeight` and no `height`, the background, dividers and padding now fill the section's full minimum height, for a pixel or a percentage minimum. Before, they stopped at the content height, so a `muted` or `section` region painted only its top part and its bottom divider sat above the section's bottom edge. With `minHeight`, the painted area also contains its children's margins and floats. A Section without `minHeight` lays out as before.

@cixzhang

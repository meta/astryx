---
'@astryxdesign/core': patch
---

[fix] `FieldLabel`'s `labelTooltip` is now an info button after the label, named "About {label}", so keyboard and screen-reader users can reach the help (WCAG 2.2 2.1.1, 4.1.2), and a click or key press on it opens the help without focusing or toggling the field.

@GuillaumeMMM @cixzhang

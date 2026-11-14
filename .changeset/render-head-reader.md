---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render --reverse` finds a rendered file's title, styles and body as a browser does, outside comments and outside the text of the style element, so an untouched file whose stylesheet text looks like HTML, or whose page path looks like a tag, no longer reads as edited.

@josephfarina

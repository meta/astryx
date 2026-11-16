---
'@astryxdesign/cli': patch
---

[experimental] In a light-only or dark-only theme, a text color set on a part whose own background is an image (a gradient button face) is written for both modes. Inside a lightbox or overlay, which Core draws in the other scheme, the text stays on that face: it no longer turns white on a light gel button. The contrast check measures it the same way.

@josephfarina

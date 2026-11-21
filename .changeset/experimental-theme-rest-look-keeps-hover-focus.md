---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` keeps a part's hover and keyboard focus visible when a setting changes its resting look. A resting `background` shorthand gives the part's hover and press layer back from Core under Core's own conditions (no press layer on a disabled part, no hover left on a touch screen after a tap). Core's focus and hover rings are drawn over a resting shadow, so a bevel never covers them. A resting `outline` gives the part's focus state Core's focus outline back. A state the theme sets itself stays as set: a hover or press background or a focus outline property set for that scope or a wider one (the whole part, one variant), or for one mode in that mode. Under a resting look for a variant and a size (`--when variant:ghost+size:sm`), a wider focus outline is copied per property, and a property the scope sets itself (a small ghost's own green) stays.

@josephfarina

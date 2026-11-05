---
'@astryxdesign/cli': patch
'@astryxdesign/theme-neutral': patch
---

[fix] Raise Neutral’s default form-control boundary to at least 3:1 against its surface. Text fields, selectors, file inputs, input groups, and unchecked checkbox/radio indicators use Neutral 60 in light mode and Neutral 50 in dark mode without changing behavior or public API.

@rubyycheung

---
'@astryxdesign/cli': patch
---

[feat] The `dashboard-scorecard` template shows its headline numbers two to a row below 768px, instead of one to a row at every width below 768px, when two tiles fit with room for five times the value's type size inside their own padding; otherwise it keeps one to a row. It never puts two numbers in a row where they do not fit, whether the phone is narrow, the theme's tile inset is wide or the text size is larger, set in the browser or on the phone. Below 768px a tile's change figure moves under the value when the two do not fit side by side. Widths of 768px and up are unchanged.

@josephfarina

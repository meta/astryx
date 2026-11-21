---
'@astryxdesign/cli': patch
---

[feat] The `dashboard-scorecard` template shows its headline numbers two to a row below 768px, instead of one to a row at every width below 768px, when two tiles fit with at least 5.5rem of content each inside their own padding; otherwise it keeps one to a row, so a narrow phone, a theme with a wide tile inset or larger text keeps every number whole. Below 768px a tile's change figure moves under the value when the two do not fit side by side. Widths of 768px and up are unchanged.

@josephfarina

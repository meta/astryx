---
'@astryxdesign/cli': patch
---

[feat] The `dashboard-scorecard` template shows its headline numbers two to a row below 768px, instead of one to a row at every width below 768px, when two tiles fit with room for five times the value's type size inside their own padding; otherwise it keeps one to a row, so a narrow phone, a theme with a wide tile inset or a larger text size, set in the browser or on the phone, keeps every number whole. Below 768px a tile's change figure moves under the value when the two do not fit side by side. Widths of 768px and up are unchanged.

@josephfarina

---
'@astryxdesign/cli': patch
---

[fix] Two example blocks no longer cause a hydration mismatch: `TimestampAutoFormat` and `TimestampRelativeFormat` read the clock once per mount after hydration instead of during render; the server markup shows a fixed placeholder date until hydration. Five example blocks that show several breadcrumbs, outlines or paginations side by side now give each one its own accessible name, so screen readers can tell the landmarks apart. No visual change after hydration.

@josephfarina

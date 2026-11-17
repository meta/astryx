---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set` and `new`:

- A part setting that only repeats what Core already draws there, such as `corners pill --on badge` on a badge that is already round, now says "this changes nothing you see" instead of listing a style change.
- The "missed" line that `new` and `set` print near the top now says what it means: these are not problems, each part still shows the base theme's look in a state or variant, nothing is broken, and running show's line for one brings it in line.

@josephfarina

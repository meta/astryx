---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set` and `new`:

- A new part setting that writes the same token reference Core already uses there, at rest and in every state, such as `border-radius var(--radius-full) --on badge`, is no longer written, and the result says "[no change]". A setting whose value only matches what the part draws today, such as `corners pill --on badge` on a round badge, is written as the person's own choice, and the result says it matches and holds if that token changes.
- The "missed" line that `new` and `set` print near the top now says what it means: each part it names, with the variant and state (or at rest), still shows the base theme's own look where your changes did not reach. Keep each one, or bring it in line with the line `show` lists for it. The JSON lists the same places as `missedWhere`.

@josephfarina

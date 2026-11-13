---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: nested sections that follow their parent, and lengths Core can calculate with.

- A section padding the same on every side is written as the section's whole padding, which Core reads after the padding a parent section passes down, so nested sections keep following their parent.
- A padding of `0` is written as `0px` on parts where Core calculates with it (card, section, dialog, drawer, bottom-sheet); `initial` and `unset` leave the padding to Core's own default.
- A hand edit to the settings file that `set` would refuse is reported by the next `set` with the command that removes it, as `compile` does, instead of being built.

@josephfarina

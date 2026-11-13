---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: padding that copies no theme's value, nested sections that follow their parent, and lengths Core can calculate with.

- A padding on a narrower selector (a clickable card, a variant, a state) no longer copies the base theme's padding onto the plain part: a plain part nested inside is reset to Core's own fallback instead, so a padding in your own theme source, or a variant you wrote, still applies.
- A section padding the same on every side is written as the section's whole padding, which Core reads after the padding a parent section passes down, so nested sections keep following their parent.
- A padding of `0` is written as `0px` on parts where Core calculates with it (card, section, dialog, drawer, bottom-sheet); `initial` and `unset` leave the padding to Core's own default.
- A hand edit to the settings file that `set` would refuse is reported by the next `set` with the command that removes it, as `compile` does, instead of being built.

@josephfarina

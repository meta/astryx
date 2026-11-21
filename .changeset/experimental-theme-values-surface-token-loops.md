---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: a token in `onDark` or `onLight` that loops through a token Core sets on that surface itself (`--color-on-dark: var(--color-text-primary)`, while Core's dark surface sets `--color-text-primary: var(--color-on-dark)`) is refused at its line.

@josephfarina

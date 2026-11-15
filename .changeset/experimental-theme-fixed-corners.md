---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a radio's circle (a part with a checked state, a square box and corners at 50%) is no corner. The corners dial on its group leaves it, in the build as in `show`; the dial on the radio alone is refused (it changes nothing you see) with the line that does set its shape (`set <theme> border-radius 0 --on radio-indicator --only`); `how` offers that line for "make radios square" and answers "rounder checkboxes" with the checkbox alone.

@josephfarina

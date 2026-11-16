---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` gives one warning, at its line, for a part's variants written as other styling libraries write them (`variants: {variant: {secondary: {…}}}`), naming the style keys that write them (`'variant:secondary': {…}`), instead of three warnings that never showed the working form. The output is the same as before.

@josephfarina

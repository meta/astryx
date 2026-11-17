---
'@astryxdesign/core': patch
---

[fix] Three styles that set a shorthand after another style on the same element set one of its longhands now set the longhands instead: an ordered List with dividers (its row gap), a flexible vertical on-track Stepper connector, and the PowerSearch sheet trigger with tokens. StyleX resolves that order differently in Storybook and in the published CSS, so each state had two computed values. It now has one. Nothing changes on screen in either build. A new lint rule, `@astryx/no-shorthand-longhand-merge`, flags the pattern.

@josephfarina

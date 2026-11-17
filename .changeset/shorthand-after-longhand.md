---
'@astryxdesign/core': patch
---

[fix] Three components now look the same in Storybook and in the published CSS. Each one had a style that set a shorthand after another style on the same element set one of its longhands. StyleX resolves that order differently in the two builds. The later style now sets the same longhands, so it wins in every build:

- An ordered List with dividers keeps the gap between its numbers and text.
- A flexible vertical on-track Stepper connector can shrink.
- The PowerSearch sheet trigger with tokens has no padding.

A new lint rule, `@astryx/no-shorthand-longhand-merge`, flags the pattern.

@josephfarina

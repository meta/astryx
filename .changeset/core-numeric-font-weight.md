---
'@astryxdesign/core': patch
---

[fix] A typography role's `weight` (and a heading's `weights`) now accepts a number, such as `heading: {weight: 700}`. Before, a number worked at the root, but a theme that extends a base with adaptations (such as a phone type scale) refused it with an error about the adaptation rule's token instead of the value the theme wrote. A number now becomes the same CSS weight as its string.

@josephfarina

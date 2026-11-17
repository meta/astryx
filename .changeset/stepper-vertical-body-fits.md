---
'@astryxdesign/core': patch
---

[fix] A vertical `Stepper` step with separated indicators (the default) keeps its content within the step. Before, a wide field in an expanded step, such as a `Selector`, pushed the step's body past the step, so on a phone the page scrolled sideways, text was cut at the right edge, and a dropdown opened off-screen. Now the body shrinks to the step's width and the content wraps inside it.

@josephfarina

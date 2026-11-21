---
'@astryxdesign/core': patch
---

[fix] Field labels use the semibold weight. Arial, Helvetica, Liberation Sans, and Segoe UI have no medium face, so a medium label drew in their regular face, at the same weight as its description. The label now draws in the next heavier face: semibold in Segoe UI, bold in Arial, Helvetica, and Liberation Sans. With fonts that have a medium face, such as the Apple and Android system fonts and the first-party theme fonts, labels become one step heavier. CheckboxInput and Switch labels use the same label style and change too.

@josephfarina

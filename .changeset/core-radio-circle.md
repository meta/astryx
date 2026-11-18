---
'@astryxdesign/core': patch
---

[fix] The radio's circle (RadioList, the menu radio, and every host of the shared radio indicator), its dot and its pressed layer are drawn at a 50% radius instead of the `--radius-full` pill token, so a theme that squares its pills keeps round radios. A theme that wants square radios overrides the radio component.

@josephfarina

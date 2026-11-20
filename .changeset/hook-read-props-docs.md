---
'@astryxdesign/cli': patch
---

[fix] `astryx hook <name>` prints a hook documented with props (such as `useTableSelectionState`, `useTableSelection` and the other Table plugin hooks) in the component read's layout: its description and usage text, its props and its examples, where the default read printed only the title. The short and brief reads match the component read. The JSON is unchanged.

@josephfarina

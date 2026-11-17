---
'@astryxdesign/cli': patch
---

[feat] `astryx doctor` warns about a Core button that does nothing when pressed (`button-actions`): a `Button` or `IconButton` from `@astryxdesign/core` with no `onClick`, `clickAction`, `href`, or `submit` or `reset` type, or with an empty handler or a link that goes nowhere (`#`, unless the app routes by the URL hash), where nothing around it acts on a press. The warning names each button's file, line and label. Doctor reads the app's own source as syntax trees and leaves out test, story and fixture files. It does not report a button it cannot judge: one with props spread in, a ref, a tooltip, or a disabled or loading state, or one inside a link, a trigger prop, or a component it does not know. The check never fails `doctor`.

@josephfarina

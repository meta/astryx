---
'@astryxdesign/core': patch
---

[fix] Toasts raised from a `BottomSheetSwitcher` step stay visible and clickable above the flow. A modal switcher flow now supplies its active step's dialog as the toast viewport's host, as a standalone scrim `BottomSheet` and a `Dialog` do; the host follows each handoff to the entering step, and the flow hands the viewport back when it closes. Before, the viewport stayed behind the flow's dialogs, so a toast raised from a step was covered by the step and a press on it landed on the step. A `hasScrim={false}` flow is not modal and leaves the viewport in place.

@imdreamrunner

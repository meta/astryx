---
'@astryxdesign/cli': patch
---

[feat] The two Bottom Sheet flow block templates (`BottomSheetSwitcherShowcase`, `BottomSheetSwitcherReviewFlow`) now teach the replacement for the deprecated `BottomSheetSwitcher`: each step is a standalone `BottomSheet` driven by one state value, and moving on replaces the open step in place. Both stay examples of `BottomSheetSwitcher` (the showcase remains that page's hero) and are now also listed under `BottomSheet`. Template ids, files and their published registry identities keep their names, so `template <name>`, the released JSON ids and the ShadCN routes are unchanged.

@imdreamrunner

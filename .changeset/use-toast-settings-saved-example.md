---
'@astryxdesign/cli': patch
---

[docs] A new `useToast — Settings Saved` example block calls the function from `useToast` on a settings form: Save shows a "Settings saved" toast with an Undo action, its `uniqueID` makes a second Save replace the toast instead of stacking another, and a failed save shows an error toast instead. Copy it with `astryx template useToastHookUsage <path>`. (#9512)

@MannXo

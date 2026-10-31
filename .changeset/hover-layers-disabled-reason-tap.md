---
'@astryxdesign/core': patch
---

[fix] Tooltip and HoverCard: a tap on a disabled `Button`, `IconButton` or `ToggleButton`, or a disabled menu item, now opens the tooltip that explains why it is disabled, and nothing activates. Before, with `touchTrigger="auto"` (the default), the tap counted as the control's own action, so on a touch screen the disabled reason could not be reached (`spec:AST-085` FR5, `architecture:interaction-modality` INV4). An `aria-disabled` control now performs no action, and a tap on a label for a disabled control opens its reason too. Taps on enabled controls, `touchTrigger="tap"` and `"none"`, and mouse hover are unchanged.

@vjeux

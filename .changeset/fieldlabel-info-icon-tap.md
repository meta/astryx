---
'@astryxdesign/core': patch
---

[feat] FieldLabel: a tap on the label's info icon (`labelTooltip`) opens its help without also toggling or focusing the control (`component:FieldLabel` FR9). Before, the tap that opened the help also activated the label's control, as a tap anywhere on a native label does: on a touch screen it focused the field, raising the keyboard, or toggled the switch or checkbox the label names, an unintended second action. Now a tap by finger or pen opens the help alone; a mouse click on the icon still activates the control like the rest of the label, and hover still shows the help.

@vjeux

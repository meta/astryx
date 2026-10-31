---
'@astryxdesign/core': patch
---

[fix] FieldLabel: a tap on the label's info icon (`labelTooltip`) opens its help without activating the control. Before, the tap that opened the help also activated the label's control, as a tap anywhere on a native label does: on a touch screen it focused the field, raising the keyboard, or toggled the switch or checkbox the label names. Now a tap by finger or pen stops at the help, so touch reaches the help as its own interaction, as every input modality should; a mouse click on the icon still activates the control like the rest of the label, and hover still shows the help.

@vjeux

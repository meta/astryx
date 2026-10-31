---
'@astryxdesign/core': minor
---

[breaking] FieldLabel: a tap on the label's info icon (`labelTooltip`) opens its help without activating the control. Before, the tap also activated the label's control, as a tap anywhere on a native label does: on a touch screen it focused the field, raising the keyboard, or toggled the switch or checkbox the label names. Now a tap by finger or pen stops at the help; a mouse click on the icon still activates the control like the rest of the label, and hover still shows the help. To get the old tap back, render the icon through `labelIcon` instead, for example `labelIcon={<Tooltip content="…" touchTrigger="tap"><Icon icon="info" /></Tooltip>}`: its tap opens the help and activates the control, as the `labelTooltip` icon's did, with the icon before the label text.

@vjeux

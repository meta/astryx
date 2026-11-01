---
'@astryxdesign/core': patch
---

[fix] `FieldLabel`'s `labelTooltip` help is now an `InfoTip` button after the label, named "About {label}". Keyboard users can now reach the help with Tab. Enter, Space, a click or a tap opens or closes it, and none of them focuses the field or toggles the control. With `isLabelHidden`, the button is hidden with the label and shows while it has keyboard focus. The help now opens at InfoTip's placement (below the button where there is room) instead of above it. Thanks @GuillaumeMMM, who first proposed naming the info icon in #6414, and @vjeux (#9089).

@cixzhang @duytbp

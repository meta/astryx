---
'@astryxdesign/core': patch
---

[fix] AlertDialog: its two actions are tracked as one group under every pointer, the way iOS tracks an alert's actions. A press that lands on one action and slides to the other runs the action it lifts on, and lifting off both runs nothing. The pressed action highlights at once, and the highlight follows the pointer between the actions. A second finger or the window losing focus ends the press with nothing run. A press on the title or the message is not tracked. The keyboard and assistive technology keep each button's own activation.

@vjeux

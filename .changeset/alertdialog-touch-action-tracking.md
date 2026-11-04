---
'@astryxdesign/core': patch
---

[fix] AlertDialog: under the touch presentation, its two actions are tracked as one group for a finger and a pen, the way iOS tracks an alert's actions. A press that lands on one action and slides to the other runs the action it lifts on, and lifting off both runs nothing. The pressed action highlights at once, and the highlight follows the finger between the actions. A second finger or the window losing focus ends the press with nothing run. A press on the title or the message is not tracked. A mouse press stays the native button's, and the keyboard and assistive technology keep each button's own activation. (#8083)

@vjeux

---
'@astryxdesign/core': patch
---

[fix] Under a finger, a press's release now lasts until its fade has played. The touch press controller ended the release on a clock started at the lift, so when the page's script delayed the fade's first frame, the release was cut short mid-fade. It now ends when the press's release animation ends, on the surface or on a part inside it that a component draws the release on, or on its clock where no release animation runs (an instant release, a surface without one, or an engine without Web Animations). This applies to every surface the touch press controller drives: buttons, switches, checkboxes, cards, menu rows and list rows.

@vjeux

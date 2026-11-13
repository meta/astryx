---
'@astryxdesign/core': patch
---

[fix] Under a finger, a Popover that overlaps its trigger now grows from where it meets the trigger, as the pointer entrance does. A popover a few pixels over its trigger's side grows from that side, not from below. A popover over its trigger's center grows from that center by scale only. Every other landing grows as before.

@vjeux

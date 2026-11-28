---
'@astryxdesign/core': patch
---

[fix] Two of Core's internal motion engines that continue one curve and are then moved by different amounts in one task no longer share keyframes. Each shows its own move until the next frame. No exported component does both today.

@vjeux

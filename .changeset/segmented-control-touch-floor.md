---
'@astryxdesign/core': patch
---

[fix] Floor SegmentedControlItem to a 44px touch target on coarse pointers — `size="lg"` topped out at 32px, below the WCAG 2.2 AA "Target Size (Minimum)" / Apple HIG / Material floor every other interactive control honours; desktop density is unchanged. (#6013)
@ManoharPaturi

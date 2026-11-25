---
'@astryxdesign/core': patch
---

[fix] Popover: a press no longer shrinks a Button, Selector, MultiSelector or ComplexSelector while an open `usePopover` popover points at it through `anchorRef`. Chrome and Safari place the popover from the control's box after the press shrinks it, so the popover moved by up to 1% of the control's width or height while the press was held. The control still shows its pressed overlay, and it shrinks on a press again when the popover closes.

@nynexman4464

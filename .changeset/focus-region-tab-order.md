---
'@astryxdesign/core': patch
---

[fix] Dialog, Popover, Drawer, BottomSheet and `useFocusTrap`: a focus region counts the controls of a popover that an Astryx layer (Popover, a menu, `usePopover`) shows with one of its controls right after that control, wherever the popover is in the region's markup, in a browser that puts a popover there in the Tab order (WCAG 2.2 SC 2.4.3, Focus Order). Before, when that popover came last in the markup, Tab from its last control wrapped to the region's first control, and Tab did not reach the controls after the one the popover is shown with. A region that holds no such popover finds the same first and last control as before. A wrap onto a control that hands focus on to another element now cancels the key press, where it left the press to the browser before. A focus region inside another one, whose container element is replaced while it is active, now answers Tab alone inside the new element. Before, the region around it answered the same Tab press too.

@nynexman4464

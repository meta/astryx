---
'@astryxdesign/core': patch
---

[fix] ButtonGroup: in forced colors (Windows high contrast), a group whose last child is hidden (a caller's `<span hidden>`, say) now closes its outer edge on the last button you can see. Before, that button drew no trailing border, so the group's outline was open on that side. The hidden child still counts as a member for the corners, so the button's trailing corners stay square as before, and nothing changes outside forced colors.

@cixzhang

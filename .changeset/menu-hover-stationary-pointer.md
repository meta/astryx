---
'@astryxdesign/core': patch
---

[fix] useMenuHover ignores layout boundary events under a stationary pointer until deliberate pointer movement or explicit activation occurs (#13610). SideNavHeading and other menus using useMenuHover stay closed when layout changes or scrolling place the trigger under a resting pointer.

@rheatkhs

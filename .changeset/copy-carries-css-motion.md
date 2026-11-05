---
'@astryxdesign/core': patch
---

[fix] The transient copy a layout motion holds of old content (an in-place swap's old content, the SideNav rail's and AppShell content's old state during a collapse or expand) carries on the CSS animations and transitions running in it from where they were. It no longer starts each CSS animation again (a press highlight lit again, an entrance that had played playing again, whatever its fill) or shows a transition's end at once.

@vjeux

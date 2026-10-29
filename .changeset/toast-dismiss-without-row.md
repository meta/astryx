---
'@astryxdesign/core': patch
---

[fix] A toast dismissed while it had no row on screen — hidden past `maxVisible`, or dismissed before it first rendered — now leaves the stack. Before, it stayed as an empty, invisible row that took a visible slot when it came back into view and kept the "Notifications" landmark (and its F6 stop) present after every real toast was gone.

@vjeux

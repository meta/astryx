---
'@astryxdesign/cli': patch
---

[fix] A release that failed to install is tried again at once when npm's registry changed since the failure, instead of waiting 2 or 10 minutes, and the reason names the registry npm tried.

@josephfarina

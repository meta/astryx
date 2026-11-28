---
'@astryxdesign/core': patch
---

[fix] A disabled SegmentedControl, DateInput or DateTimeInput no longer runs a caller's key, paste, pointer or click handlers; only `onFocus` and `onBlur` still run, as on other disabled controls. A disabled control that stays focusable now invokes no caller callback, as a natively disabled one invokes none.

@cixzhang

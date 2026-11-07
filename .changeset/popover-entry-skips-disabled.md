---
'@astryxdesign/core': patch
---

[fix] A dialog Popover no longer starts focus on a disabled control. It starts on the first enabled control, or on its labelled surface when every control is disabled. Before, a DateInput or DateTimeInput calendar whose range made a month button disabled opened with focus on that disabled button. Disabled controls stay reachable by Tab.

@cixzhang

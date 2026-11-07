---
'@astryxdesign/core': patch
---

[fix] A dialog Popover starts focus on its first enabled tab stop. It skips a disabled control and a roving-widget member that holds `tabindex="-1"`, and starts on its labelled surface when every control is disabled. Before, a DateInput or DateTimeInput calendar whose range starts in the shown month opened on the disabled Previous month button, and a one-month range opened on day 1 instead of the selected day or today. Disabled controls stay reachable by Tab.

@cixzhang

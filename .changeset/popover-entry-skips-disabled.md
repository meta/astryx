---
'@astryxdesign/core': patch
---

[fix] A dialog Popover starts focus on its first enabled tab stop. It skips a disabled control, lets an element that holds `tabindex="-1"` yield to a later tab stop, and starts on its labelled surface when every control is disabled. Before, a DateInput or DateTimeInput calendar whose range starts in the shown month opened on the disabled Previous month button. Now it opens on Next month, or, in a one-month range, on the selected day, else today, else the first enabled day. Disabled controls stay reachable by Tab.

@cixzhang

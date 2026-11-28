---
'@astryxdesign/core': patch
---

[fix] A disabled SegmentedControl (its radiogroup and every segment), DateInput or DateTimeInput no longer runs a caller's key, paste, pointer or click handlers; only `onFocus` and `onBlur` still run, as on a disabled TextInput, Selector, CheckboxInput or Slider. These controls stay focusable while disabled, and now invoke no caller callback, as a natively disabled control invokes none. A `className` or `style` passed to a SegmentedControlItem now reaches the segment; before, the segment's own styling replaced it.

@cixzhang

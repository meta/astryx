---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a dial whose number is in pixels takes that number typed with its unit, in any letters and with a space before it, so `set t text-size 24px` sets 24 as `set t text-size 24` does; undo, `new --text-size` and a saved `20px` read it the same way. A size past the dial's range is refused naming the value as typed.

@josephfarina

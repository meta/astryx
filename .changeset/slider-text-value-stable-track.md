---
'@astryxdesign/core': patch
---

[fix] Slider: with `valueDisplay="text"`, the track keeps one length while the value changes and while a thumb is dragged, so the thumb stays under the pointer. The value text's box has a floor of one `ch` per character of the longest text any step value shows, plus one, with the text at its end. Above 200 steps the floor counts only the ends and the values one step in, so a custom `formatValue` whose widest output is mid-range may still move the track.

@cixzhang
@AKnassa

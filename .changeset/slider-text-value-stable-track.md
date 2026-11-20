---
'@astryxdesign/core': patch
---

[fix] Slider: with `valueDisplay="text"`, the track keeps one length while the value changes and while a thumb is dragged, so the thumb stays under the pointer. The value text's box has a floor of one `ch` per character of the longer end value, plus one, with the text at its end. A formatted value longer than both ends can still widen the box.

@cixzhang
@AKnassa

---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a leading said in pixels in a clause of its own ("18px leading", "line height 18px") as that many pixels over the text size: a text size in pixels another clause asks and the answer writes as typed ("13px text, 18px leading" writes `text-size 13` and `--text-body-leading 1.385`), else the body text size there now; the answer names the reading. A text size in the same clause ("font size 13px line height 18px"), one no answer reads ("13px body text with 18px leading"), or one said as a change ("the text 2px bigger", "bigger text") leaves the leading as it was read before, and so does an ask that says a text size and also has a length typed in pt, rem or em ("font size 1rem", "text size 12pt", "13px text, 18px leading, 0.5rem radius"), and so does a leading clause that names the text at all ("body text 16px line height relaxed", "font size 16px line height normal"). On a part ("headings 32px line height") the pixels are written as typed. It was read as a step up from the line height there now.

@josephfarina

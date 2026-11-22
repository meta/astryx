---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a leading said in pixels in a clause of its own ("18px leading", "line height 18px") as that many pixels over the text size: a text size another clause asks and the answer writes ("13px text, 18px leading" writes `text-size 13` and `--text-body-leading 1.385`), else the body text size there now; the answer names the reading. A text size in the same clause ("font size 13px line height 18px") or one no answer reads ("13px body text with 18px leading") leaves the leading as it was read before. On a part ("headings 32px line height") the pixels are written as typed. It was read as a step up from the line height there now.

@josephfarina

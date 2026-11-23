---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` writes a file named in one `url()` as typed: its case, dots and words are kept (`url(Hero.JPG)`, `url(img/heroImage-one.png)`, `url(/img/black-and-white.jpg)`), and no word of its path is read as a part, corrected or taken as a break between asks. Before, the question reader rewrote it (`url(hero jpg)`) and wrote another value or none. A file inside `url()` is a value to write, so the answer no longer adds the "how reads words, never a picture" note. Two `url()` layers are not yet written as one value.

@josephfarina

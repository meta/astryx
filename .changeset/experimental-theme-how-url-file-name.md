---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` writes a file named in `url()` as typed: its case, dots and words are kept (`url(Hero.JPG)`, `url(img/heroImage-one.png)`), where the question reader used to change it (`url(hero jpg)`) and write another value or none. A file inside `url()` is a value to write, not a picture to match, so the answer no longer adds the "how reads words, never a picture" note.

@josephfarina

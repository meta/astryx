---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show` keeps going where a page it draws cannot carry or write something: a theme image over 8 MB is left out of the pages and named in show's notes, rather than stopping the pages, and `show --png` in a theme folder that cannot be written names the folder, rather than refusing on a family page it could not write.

@josephfarina

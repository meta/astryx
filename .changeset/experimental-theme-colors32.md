---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: suggestions keep the value meant, and fractional text sizes say how they build.

- An exact token refused only for how its value was typed (a trailing `;`, a comment, quotes around it, full-width `＃`) suggests that same value, not a stock one.
- A font name that needs quotes (`Font Awesome 6 Free`) on a font token or a part's `font-family` is suggested quoted, as the font dial writes it.
- A fractional `text-size` (`15.5`) is saved as the whole pixel the type scale builds, and the result says so.

@josephfarina

---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: in a font family name, every Unicode space (a no-break space, a thin space) is one space and zero-width characters are dropped, so `Open<no-break space>Sans` names Open Sans. A dial's value pasted with its property name (`border-radius: pill`, `font-size: 18px;` for text-size, `color: #e11d48` for accent) is read as the value, one path for every dial. A declaration pasted as one argument (`set b '--color-accent: #e11d48'` or `--color-accent:#e11d48`) sets that token to that value; `set`'s usage now shows the value as `[value...]`, and a set with no value gives the same missing-value error as before.

@josephfarina

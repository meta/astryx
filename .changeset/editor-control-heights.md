---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: buttons, inputs, selectors and input groups share one height at each size (a control whose content is taller, such as a typeahead or tokenizer, keeps its content's height, and a complex selector keeps its own). `--only` keeps a height on one control, a button included; a height that becomes a size token must be a length (`auto` is refused there), and a selector, typeahead or tokenizer keeps Core's top and bottom padding, so a theme's padding never makes it taller than the other controls (a new top or bottom padding alone on one is refused); a file input's field does too, while its drop zone keeps the padding set for it. A height set on a control is written as that size's control token on the new `controls` group, so every control at that size takes it. `show` lists a saved height that keeps some controls apart, with the line that joins it to the others.

@josephfarina

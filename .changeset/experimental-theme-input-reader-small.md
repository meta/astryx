---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a `radius` or `rounded` value with its unit is offered as that size on corners (`radius 1rem` gives `corners 16px`), and one corners cannot read gets `how corners`; a text size written as constant math (`calc(16px + 2px)`) is worked out, and a bare number with no unit (`text-size 1.5`, `corners 0.5`) gets `how` instead of a guessed size; a color-mix share written as percentage math (`calc(50% * 1)`) is read; two color names run together (`navyblue`) offer the first; `on button: pill`, a flag's value and the value in one (`state=hover 4px`), and `light: red dark: blue` without a comma are read; a font list in single quotes (`['Inter', 'serif']`) is read; in a light-only or dark-only theme the theme's own mode label is the value, and the other mode's label is refused naming the mode the theme does not show; `cursor hand`, which no current browser applies, is refused with `pointer`.

@josephfarina
